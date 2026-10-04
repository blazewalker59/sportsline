/// <reference types="@cloudflare/workers-types" />
/**
 * Runs the once-a-minute schedule sync on its own alarm (docs/adr/0001,
 * "Scheduling"). Cron Triggers never fired for this Worker, so the same
 * alarm mechanism that polls live Games drives the schedule too.
 *
 * The loop starts on the first request after a deploy (`ensureRunning`, from
 * the Worker entry) and reschedules itself before syncing, so a failed sync
 * never stops it. Once a day it also runs the roster sync.
 */

import { DurableObject } from 'cloudflare:workers'
import { nextMinute } from './pacing'
import { syncRoster } from './roster'
import { trimRoutinePlays } from './retention'
import { syncSchedules } from './schedule'
import type { CloudflareEnv } from '@/lib/db'
import {
  accountsDue as fantasyAccountsDue,
  syncAccount as syncFantasy,
} from '@/lib/fantasy/sync'
import {
  accountsDue,
  pruneHistory,
  refreshPrices,
  syncAccount,
} from '@/lib/kalshi/sync'
import { sendPredictionAlerts } from '@/lib/push/predictionAlerts'
import { ACTIVE_LEAGUES } from '@/lib/sources'

/**
 * Bump the version when the roster sync starts storing something new
 * (v2: headshots; v3: MLB's square headshots; v4/v5: college football's
 * own Source, restoring NFL names and logos), so every League resyncs
 * right after the deploy instead of at its next daily run.
 */
const ROSTER_DUE_KEY = 'rosterDueAt:v5'
/** Rosters refresh daily; the first run after a deploy syncs straight away. */
const ROSTER_EVERY_MS = 20 * 3_600_000
const ROSTER_RETRY_MS = 15 * 60_000
const TRIM_DUE_KEY = 'trimDueAt'
const KALSHI_SYNC_EVERY_MS = 5 * 60_000
const KALSHI_SYNCS_PER_TICK = 5
/** Fantasy points move with every play; Matchups refresh this often. */
const FANTASY_SYNC_EVERY_MS = 2 * 60_000
const FANTASY_SYNCS_PER_TICK = 5
const TRIM_EVERY_MS = 24 * 3_600_000

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
    // Schedules first: they are what makes Games go live, and a slow roster
    // sync (dozens of Source calls) must never hold them up.
    await syncSchedules(this.env, new Date(now))
    for (const league of ACTIVE_LEAGUES) {
      const key = `${ROSTER_DUE_KEY}:${league}`
      const dueAt = (await this.ctx.storage.get<number>(key)) ?? 0
      if (now < dueAt) continue
      // Push the next attempt out first so a slow or failing sync is not
      // retried every minute; only a success waits a full day.
      await this.ctx.storage.put(key, now + ROSTER_RETRY_MS)
      if (await syncRoster(this.env, league, new Date(now))) {
        await this.ctx.storage.put(key, now + ROSTER_EVERY_MS)
      }
    }
    // Retention, daily: trim Routine Plays past RETENTION_DAYS.
    const trimDue = (await this.ctx.storage.get<number>(TRIM_DUE_KEY)) ?? 0
    if (now >= trimDue) {
      await this.ctx.storage.put(TRIM_DUE_KEY, now + ROSTER_RETRY_MS)
      try {
        const deleted = await trimRoutinePlays(this.env, new Date(now))
        console.log('Retention trimmed Routine Plays', { deleted })
        await pruneHistory(this.env)
        await this.ctx.storage.put(TRIM_DUE_KEY, now + TRIM_EVERY_MS)
      } catch (error) {
        console.error('Retention trim failed', { error: String(error) })
      }
    }
    await this.kalshi()
    await this.fantasy()
  }

  /** Fantasy (docs/adr/0004): each connected ESPN account's Matchups. */
  private async fantasy(): Promise<void> {
    try {
      for (const viewerId of await fantasyAccountsDue(
        this.env,
        FANTASY_SYNC_EVERY_MS,
        FANTASY_SYNCS_PER_TICK,
      )) {
        await syncFantasy(this.env, viewerId).catch((error: unknown) =>
          console.error('Fantasy sync failed', { error: String(error) }),
        )
      }
    } catch (error) {
      console.error('Fantasy accounts failed', { error: String(error) })
    }
  }

  /**
   * Predictions (docs/adr/0003): Odds for every open Prediction's markets
   * each minute, each connected account's positions every few minutes,
   * then any Prediction Alerts those reveal.
   * Failures are logged; the loop never stops for Kalshi.
   */
  private async kalshi(): Promise<void> {
    try {
      await refreshPrices(this.env)
    } catch (error) {
      console.error('Kalshi prices failed', { error: String(error) })
    }
    try {
      for (const viewerId of await accountsDue(
        this.env,
        KALSHI_SYNC_EVERY_MS,
        KALSHI_SYNCS_PER_TICK,
      )) {
        await syncAccount(this.env, viewerId).catch((error: unknown) =>
          console.error('Kalshi sync failed', { error: String(error) }),
        )
      }
    } catch (error) {
      console.error('Kalshi accounts failed', { error: String(error) })
    }
    // Prediction Alerts' key moments, read from what was just refreshed.
    try {
      const sent = await sendPredictionAlerts(this.env)
      if (sent > 0) console.log('Prediction alerts sent', { sent })
    } catch (error) {
      console.error('Prediction alerts failed', { error: String(error) })
    }
  }
}
