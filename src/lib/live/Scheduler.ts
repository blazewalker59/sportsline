/// <reference types="@cloudflare/workers-types" />
/**
 * Runs the once-a-minute schedule sync on its own alarm (docs/adr/0001,
 * "Scheduling"). Cron Triggers never fired for this Worker, so the same
 * alarm mechanism that polls live Games drives the schedule too.
 *
 * The loop starts on the first request after a deploy (`ensureRunning`, from
 * the Worker entry) and reschedules itself before syncing, so a failed sync
 * never stops it.
 */

import { DurableObject } from 'cloudflare:workers'
import { nextMinute } from './pacing'
import { syncSchedules } from './schedule'
import type { CloudflareEnv } from '@/lib/db'

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
    await syncSchedules(this.env, new Date(now))
  }
}
