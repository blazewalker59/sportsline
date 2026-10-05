/// <reference types="@cloudflare/workers-types" />
/**
 * One Viewer's syncing, on their own alarm (docs/adr/0005): Kalshi prices
 * and Prediction Alerts each minute while they hold open Predictions,
 * Kalshi positions every five minutes, ESPN and Sleeper Matchups every
 * two. Each task keeps its own due time and backs off on its own when it
 * fails, so one Viewer's slow Source never delays another's. With no
 * connected accounts the object stops scheduling itself; it's started when
 * a Viewer connects or opens the app, and the Scheduler's sweep restarts
 * any that should be running.
 */

import { DurableObject } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import type { CloudflareEnv } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import {
  espnAccounts,
  kalshiAccounts,
  predictions,
  sleeperAccounts,
} from '@/lib/db/schema'
import { syncAccount as syncSleeper } from '@/lib/fantasy/sleeper/sync'
import { syncAccount as syncEspn } from '@/lib/fantasy/sync'
import { refreshPrices, syncAccount as syncKalshi } from '@/lib/kalshi/sync'
import { runJob } from '@/lib/ops/jobs'
import { sendPredictionAlerts } from '@/lib/push/predictionAlerts'

const MINUTE = 60_000
/** A failing task waits this long at most before trying again. */
const MAX_BACKOFF_MS = 30 * MINUTE

type Task = 'kalshiPrices' | 'kalshiPositions' | 'espn' | 'sleeper'

const EVERY: Record<Task, number> = {
  kalshiPrices: MINUTE,
  kalshiPositions: 5 * MINUTE,
  espn: 2 * MINUTE,
  sleeper: 2 * MINUTE,
}

interface TaskState {
  dueAt: number
  failures: number
}

/** What the Viewer has connected: the tasks worth running. */
interface Connected {
  kalshi: boolean
  openPredictions: boolean
  espn: boolean
  sleeper: boolean
}

export class ViewerSync extends DurableObject<CloudflareEnv> {
  /** Start (or keep) this Viewer's loop. Idempotent and cheap. */
  async start(viewerId: string): Promise<void> {
    if ((await this.ctx.storage.get<string>('viewerId')) !== viewerId)
      await this.ctx.storage.put('viewerId', viewerId)
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(Date.now())
  }

  /** Run every task now (a Viewer connected an account or synced). */
  async syncNow(viewerId: string): Promise<void> {
    await this.ctx.storage.put('viewerId', viewerId)
    await this.ctx.storage.delete('tasks')
    await this.ctx.storage.setAlarm(Date.now())
  }

  async alarm(): Promise<void> {
    const viewerId = await this.ctx.storage.get<string>('viewerId')
    if (!viewerId) return
    const connected = await this.connected(viewerId)
    const wanted: Array<Task> = [
      ...(connected.kalshi && connected.openPredictions
        ? (['kalshiPrices'] as const)
        : []),
      ...(connected.kalshi ? (['kalshiPositions'] as const) : []),
      ...(connected.espn ? (['espn'] as const) : []),
      ...(connected.sleeper ? (['sleeper'] as const) : []),
    ]
    // Nothing connected (or everything disconnected): stop until started.
    if (wanted.length === 0) return

    const tasks =
      (await this.ctx.storage.get<Partial<Record<Task, TaskState>>>('tasks')) ??
      {}
    const now = Date.now()
    for (const task of wanted) {
      const state = tasks[task] ?? { dueAt: 0, failures: 0 }
      if (state.dueAt > now) continue
      const ok = await this.run(task, viewerId)
      const failures = ok ? 0 : state.failures + 1
      const wait = ok
        ? EVERY[task]
        : Math.min(MAX_BACKOFF_MS, EVERY[task] * 2 ** failures)
      tasks[task] = { dueAt: Date.now() + wait, failures }
    }
    await this.ctx.storage.put('tasks', tasks)
    const next = Math.min(
      ...wanted.map((t) => tasks[t]?.dueAt ?? now + EVERY[t]),
      // Holding no open Predictions: look again for new ones in five minutes.
      now + 5 * MINUTE,
    )
    await this.ctx.storage.setAlarm(Math.max(next, Date.now() + 5_000))
  }

  private async run(task: Task, viewerId: string): Promise<boolean> {
    const env = this.env
    const job = (work: () => Promise<unknown>) =>
      runJob(env, `${task}:${viewerId}`, EVERY[task], work, { viewerId }).then(
        (r) => r.ok,
      )
    switch (task) {
      case 'kalshiPrices':
        // Odds first, then any Prediction Alerts they reveal.
        return job(async () => {
          await refreshPrices(env, viewerId)
          await sendPredictionAlerts(env, viewerId)
        })
      case 'kalshiPositions':
        return job(() => syncKalshi(env, viewerId))
      case 'espn':
        return job(() => syncEspn(env, viewerId))
      case 'sleeper':
        return job(() => syncSleeper(env, viewerId))
    }
  }

  private async connected(viewerId: string): Promise<Connected> {
    const db = dbFromD1(this.env.DB)
    const [kalshi, open, espn, sleeper] = await Promise.all([
      db
        .select({ id: kalshiAccounts.viewerId })
        .from(kalshiAccounts)
        .where(eq(kalshiAccounts.viewerId, viewerId))
        .get(),
      db
        .select({ id: predictions.id })
        .from(predictions)
        .where(
          and(
            eq(predictions.viewerId, viewerId),
            eq(predictions.status, 'open'),
          ),
        )
        .limit(1)
        .get(),
      db
        .select({ id: espnAccounts.viewerId })
        .from(espnAccounts)
        .where(eq(espnAccounts.viewerId, viewerId))
        .get(),
      db
        .select({ id: sleeperAccounts.viewerId })
        .from(sleeperAccounts)
        .where(eq(sleeperAccounts.viewerId, viewerId))
        .get(),
    ])
    return {
      kalshi: Boolean(kalshi),
      openPredictions: Boolean(open),
      espn: Boolean(espn),
      sleeper: Boolean(sleeper),
    }
  }
}
