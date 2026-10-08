/// <reference types="@cloudflare/workers-types" />
/**
 * The global loop, on its own alarm each minute (docs/adr/0001,
 * "Scheduling"; docs/adr/0005): League schedules every minute, rosters and
 * retention daily, a sweep that keeps every connected Viewer's ViewerSync
 * running, and a check for stale jobs. Viewers' own syncing (Kalshi, ESPN,
 * Sleeper) runs in their ViewerSync, not here. Every job goes through
 * runJob, so each keeps a heartbeat and a failure is reported, never
 * thrown: one job can't stop the others or the loop.
 *
 * The loop starts on the first request after a deploy (`ensureRunning`,
 * from the Worker entry) and reschedules itself before working.
 */

import { DurableObject } from 'cloudflare:workers'
import { nextMinute } from './pacing'
import { trimRoutinePlays } from './retention'
import { syncRoster } from './roster'
import { syncSchedules } from './schedule'
import { startViewerSync } from './startViewerSync'
import type { CloudflareEnv } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import {
  espnAccounts,
  jobRuns,
  kalshiAccounts,
  sleeperAccounts,
} from '@/lib/db/schema'
import { pruneHistory } from '@/lib/kalshi/sync'
import { reportError } from '@/lib/ops/errors'
import { isStale, runJob } from '@/lib/ops/jobs'
import { ACTIVE_LEAGUES } from '@/lib/sources'
import { publishDue, publishSlate, recheckSlate } from '@/lib/sharp/slate'
import { trackTrendPicks } from '@/lib/sharp/trendRecord'
import { sportsDayOf } from '@/lib/model/sportsDay'

const MINUTE = 60_000
/**
 * Bump the version when the roster sync starts storing something new
 * (v2: headshots; v3: MLB's square headshots; v4/v5: college football's
 * own Source, restoring NFL names and logos), so every League resyncs
 * right after the deploy instead of at its next daily run.
 */
const ROSTER_DUE_KEY = 'rosterDueAt:v5'
/** Rosters refresh daily; the first run after a deploy syncs straight away. */
const ROSTER_EVERY_MS = 20 * 60 * MINUTE
const RETRY_MS = 15 * MINUTE
const TRIM_DUE_KEY = 'trimDueAt'
const TRIM_EVERY_MS = 24 * 60 * MINUTE
const SWEEP_DUE_KEY = 'sweepDueAt'
const SWEEP_EVERY_MS = 10 * MINUTE
const STALE_DUE_KEY = 'staleDueAt'
const SHARP_DAY_KEY = 'sharpDay'
const SHARP_RETRY_KEY = 'sharpRetryAt'
const SHARP_EMPTY_KEY = 'sharpEmptyTries'
const SHARP_RECHECK_KEY = 'sharpRecheckDueAt'
const TREND_TRACK_KEY = 'trendTrackDueAt'
const SHARP_RECHECK_EVERY_MS = 15 * MINUTE

export class Scheduler extends DurableObject<CloudflareEnv> {
  /** Start the loop if it is not already running. Idempotent and cheap. */
  async ensureRunning(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now())
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now()
    await this.ctx.storage.setAlarm(nextMinute(now))
    const env = this.env
    // Schedules first: they are what makes Games go live, and a slow roster
    // sync (dozens of Source calls) must never hold them up.
    await runJob(env, 'schedules', MINUTE, () =>
      syncSchedules(env, new Date(now)),
    )
    for (const league of ACTIVE_LEAGUES) {
      await this.daily(`${ROSTER_DUE_KEY}:${league}`, ROSTER_EVERY_MS, () =>
        runJob(env, `roster:${league}`, ROSTER_EVERY_MS, async () => {
          if (!(await syncRoster(env, league, new Date(now))))
            throw new Error(`Roster sync failed for ${league}`)
        }),
      )
    }
    // Retention, daily: trim Routine Plays past RETENTION_DAYS.
    await this.daily(TRIM_DUE_KEY, TRIM_EVERY_MS, () =>
      runJob(env, 'retention', TRIM_EVERY_MS, async () => {
        const deleted = await trimRoutinePlays(env, new Date(now))
        console.log('Retention trimmed Routine Plays', { deleted })
        await pruneHistory(env)
      }),
    )
    // Sharp picks (docs/adr/0006): the morning slate, then re-checks.
    await this.sharpSlate(now)
    await this.daily(SHARP_RECHECK_KEY, SHARP_RECHECK_EVERY_MS, () =>
      runJob(env, 'sharp-recheck', SHARP_RECHECK_EVERY_MS, () =>
        recheckSlate(env, new Date()),
      ),
    )
    // find_bet's Trend picks (docs/adr/0009): placed? settled?
    await this.daily(TREND_TRACK_KEY, SHARP_RECHECK_EVERY_MS, () =>
      runJob(env, 'trend-picks', SHARP_RECHECK_EVERY_MS, () =>
        trackTrendPicks(env, new Date()),
      ),
    )
    await this.daily(SWEEP_DUE_KEY, SWEEP_EVERY_MS, () =>
      runJob(env, 'sweep', SWEEP_EVERY_MS, () => this.sweep()),
    )
    await this.daily(STALE_DUE_KEY, SWEEP_EVERY_MS, () =>
      runJob(env, 'stale-check', SWEEP_EVERY_MS, () => this.staleCheck()),
    )
  }

  /**
   * Run `work` when its due time (kept under `key`) has passed. The next
   * attempt is pushed out first, so a slow or failing job is retried in
   * RETRY_MS, not every minute; only a success waits its full interval.
   */
  private async daily(
    key: string,
    everyMs: number,
    work: () => Promise<{ ok: boolean }>,
  ): Promise<void> {
    const now = Date.now()
    if (now < ((await this.ctx.storage.get<number>(key)) ?? 0)) return
    await this.ctx.storage.put(key, now + Math.min(RETRY_MS, everyMs))
    if ((await work()).ok) await this.ctx.storage.put(key, now + everyMs)
  }

  /**
   * Publish today's Sharp picks once, from 10am Eastern; a failed attempt
   * waits RETRY_MS before the next.
   */
  private async sharpSlate(now: number): Promise<void> {
    const day = sportsDayOf(new Date(now))
    if (!publishDue(new Date(now))) return
    if ((await this.ctx.storage.get<string>(SHARP_DAY_KEY)) === day) return
    const retryAt = (await this.ctx.storage.get<number>(SHARP_RETRY_KEY)) ?? 0
    if (now < retryAt) return
    await this.ctx.storage.put(SHARP_RETRY_KEY, now + RETRY_MS)
    const run = await runJob(this.env, 'sharp-slate', 24 * 60 * MINUTE, () =>
      publishSlate(this.env, new Date(now)),
    )
    if (run.ok && run.value) {
      await this.ctx.storage.put(SHARP_DAY_KEY, day)
      await this.ctx.storage.delete(SHARP_EMPTY_KEY)
      return
    }
    // Nothing to pick from yet (markets not open, a source down): try
    // again hourly, three times at most, since each try spends Odds API
    // credits.
    if (!run.ok) return
    const tries =
      ((await this.ctx.storage.get<number>(SHARP_EMPTY_KEY)) ?? 0) + 1
    await this.ctx.storage.put(SHARP_EMPTY_KEY, tries)
    if (tries >= 3) {
      await this.ctx.storage.put(SHARP_DAY_KEY, day)
      await this.ctx.storage.delete(SHARP_EMPTY_KEY)
    } else await this.ctx.storage.put(SHARP_RETRY_KEY, now + 60 * MINUTE)
  }

  /** Keep every Viewer with a connected account syncing (idempotent). */
  private async sweep(): Promise<number> {
    const db = dbFromD1(this.env.DB)
    const ids = new Set<string>()
    for (const table of [kalshiAccounts, espnAccounts, sleeperAccounts])
      for (const r of await db.select({ id: table.viewerId }).from(table))
        ids.add(r.id)
    for (const id of ids) await startViewerSync(this.env, id)
    return ids.size
  }

  /** Report each job that hasn't worked in twice its interval. */
  private async staleCheck(): Promise<void> {
    const runs = await dbFromD1(this.env.DB).select().from(jobRuns)
    for (const run of runs.filter((r) => isStale(r)))
      await reportError(
        this.env,
        'stale',
        new Error(`${run.name.split(':')[0]} hasn't worked recently`),
        { job: run.name, lastOkAt: run.lastOkAt, lastError: run.lastError },
      )
  }
}
