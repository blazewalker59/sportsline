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
import { syncSchedules } from './schedule'
import type { CloudflareEnv } from '@/lib/db'
import { ACTIVE_LEAGUES } from '@/lib/sources'

/**
 * Bump the version when the roster sync starts storing something new
 * (v2: headshots), so every League resyncs right after the deploy instead
 * of at its next daily run.
 */
const ROSTER_DUE_KEY = 'rosterDueAt:v2'
/** Rosters refresh daily; the first run after a deploy syncs straight away. */
const ROSTER_EVERY_MS = 20 * 3_600_000
const ROSTER_RETRY_MS = 15 * 60_000

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
  }
}
