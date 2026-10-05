/**
 * Running a background job (docs/adr/0005): each run is timed and its
 * heartbeat kept in `job_runs` (started, last worked, last failed), and a
 * failure is reported, never thrown, so one job can't stop the others.
 * The health page reads the heartbeats; a job not working for twice its
 * interval is stale. Server only.
 */

import { sql } from 'drizzle-orm'
import { reportError } from './errors'
import type { OpsEnv } from './errors'
import { dbFromD1 } from '@/lib/db'
import { jobRuns } from '@/lib/db/schema'

export async function runJob<T>(
  env: OpsEnv,
  name: string,
  everyMs: number,
  work: () => Promise<T>,
  context: Record<string, unknown> = {},
): Promise<{ ok: true; value: T } | { ok: false }> {
  const db = dbFromD1(env.DB)
  const started = Date.now()
  const startedAt = new Date(started).toISOString()
  await db
    .insert(jobRuns)
    .values({ name, everyMs, lastStartedAt: startedAt, runs: 1 })
    .onConflictDoUpdate({
      target: jobRuns.name,
      set: {
        everyMs,
        lastStartedAt: startedAt,
        runs: sql`${jobRuns.runs} + 1`,
      },
    })
    .catch(() => undefined)
  try {
    const result = await work()
    await db
      .update(jobRuns)
      .set({
        lastOkAt: new Date().toISOString(),
        lastDurationMs: Date.now() - started,
      })
      .where(sql`${jobRuns.name} = ${name}`)
      .catch(() => undefined)
    return { ok: true, value: result }
  } catch (error) {
    await db
      .update(jobRuns)
      .set({
        lastErrorAt: new Date().toISOString(),
        lastError: String(error).slice(0, 300),
        lastDurationMs: Date.now() - started,
        failures: sql`${jobRuns.failures} + 1`,
      })
      .where(sql`${jobRuns.name} = ${name}`)
      .catch(() => undefined)
    await reportError(env, `job:${name.split(':')[0]}`, error, {
      job: name,
      ...context,
    })
    return { ok: false }
  }
}

/** Is a job overdue: no success within twice its interval? */
export function isStale(
  run: {
    everyMs: number
    lastOkAt: string | null
    lastStartedAt: string | null
  },
  now = Date.now(),
): boolean {
  const since = Date.parse(run.lastOkAt ?? run.lastStartedAt ?? '')
  return Number.isNaN(since) || now - since > run.everyMs * 2
}
