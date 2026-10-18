/**
 * The health page's reads (admins only) and the browser's error reports
 * (docs/adr/0005).
 */

import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { fingerprintOf, isAdmin, messageOf, reportError } from './errors'
import { isStale } from './jobs'
import type { Database } from '@/lib/db'
import { viewerMiddleware } from '@/lib/viewer/middleware'
import { getCloudflareEnv, getDb } from '@/lib/db'
import {
  errorEvents,
  espnAccounts,
  jobRuns,
  kalshiAccounts,
  sleeperAccounts,
  user,
} from '@/lib/db/schema'

export interface JobView {
  name: string
  everyMs: number
  lastStartedAt: string | null
  lastOkAt: string | null
  lastErrorAt: string | null
  lastError: string | null
  lastDurationMs: number | null
  runs: number
  failures: number
  stale: boolean
}

export interface AccountView {
  viewer: string
  provider: 'kalshi' | 'espn' | 'sleeper'
  status: 'ok' | 'error'
  lastError: string | null
  syncedAt: string | null
}

export interface ErrorView {
  fingerprint: string
  scope: string
  message: string
  count: number
  firstAt: string
  lastAt: string
  /** The latest occurrence's details, as JSON. */
  details: string | null
}

/** Why there's nothing to show: who the server sees. Nothing about who
 * the admins are, or how many. */
export interface OpsDenied {
  denied: true
  email: string
}

export interface OpsHealth {
  denied?: false
  jobs: Array<JobView>
  accounts: Array<AccountView>
  errors: Array<ErrorView>
}

export const getOpsHealth = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .handler(async ({ context: { viewer } }): Promise<OpsHealth | OpsDenied> => {
    const env = getCloudflareEnv()
    if (!isAdmin(env, viewer.email)) {
      console.warn('[ops] health denied', { viewerId: viewer.id })
      return { denied: true, email: viewer.email }
    }
    const db = getDb()
    const [jobs, errors, users, kalshi, espn, sleeper] = await Promise.all([
      db.select().from(jobRuns),
      db.select().from(errorEvents).orderBy(desc(errorEvents.lastAt)).limit(60),
      db.select({ id: user.id, name: user.name }).from(user),
      db.select().from(kalshiAccounts),
      db.select().from(espnAccounts),
      db.select().from(sleeperAccounts),
    ])
    const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id
    const account = (
      provider: AccountView['provider'],
      r: {
        viewerId: string
        status: 'ok' | 'error'
        lastError: string | null
        syncedAt: string | null
      },
    ): AccountView => ({
      viewer: nameOf(r.viewerId),
      provider,
      status: r.status,
      lastError: r.lastError,
      syncedAt: r.syncedAt,
    })
    return {
      jobs: jobs
        .map((j) => ({ ...j, stale: isStale(j) }))
        .sort(
          (a, b) =>
            Number(b.stale) - Number(a.stale) || a.name.localeCompare(b.name),
        ),
      accounts: [
        ...kalshi.map((r) => account('kalshi', r)),
        ...espn.map((r) => account('espn', r)),
        ...sleeper.map((r) => account('sleeper', r)),
      ],
      errors: errors.map(({ context, notifiedAt: _, ...e }) => ({
        ...e,
        details: context ? JSON.stringify(context, null, 2) : null,
      })),
    }
  })

/** Browser errors this isolate has taken per Viewer this minute: a cheap
 * first filter, before D1 is asked. */
const recent = new Map<string, { minute: number; count: number }>()
const PER_MINUTE = 10

/** Each kind of browser error is recorded at most this often. */
const KIND_EVERY_MS = 60_000
/** New kinds of browser error recorded per hour, across every Viewer. */
const NEW_KINDS_PER_HOUR = 30

/**
 * Whether to record a browser error, bounded across isolates by what
 * error_events already holds: a kind seen in the last minute only adds to
 * its count's story once a minute, and new kinds stop once an hour has
 * brought plenty (a flood of made-up messages can't fill the table, or
 * page the admins, without end).
 */
async function worthRecording(
  db: Database,
  fingerprint: string,
  now: number,
): Promise<boolean> {
  const seen = await db
    .select({ lastAt: errorEvents.lastAt })
    .from(errorEvents)
    .where(eq(errorEvents.fingerprint, fingerprint))
    .get()
  if (seen) return now - Date.parse(seen.lastAt) >= KIND_EVERY_MS
  const [fresh] = await db
    .select({ n: count() })
    .from(errorEvents)
    .where(
      and(
        eq(errorEvents.scope, 'client'),
        gte(errorEvents.firstAt, new Date(now - 3_600_000).toISOString()),
      ),
    )
  return fresh.n < NEW_KINDS_PER_HOUR
}

/** A crash or unhandled failure in the browser, reported to the same place. */
export const reportClientError = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator(
    (data: { message: string; stack?: string; path?: string; kind?: string }) =>
      z
        .object({
          message: z.string().max(1000),
          stack: z.string().max(4000).optional(),
          path: z.string().max(400).optional(),
          kind: z.string().max(40).optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context: { viewer, db } }) => {
    const now = Date.now()
    const minute = Math.floor(now / 60_000)
    const seen = recent.get(viewer.id)
    const taken = seen?.minute === minute ? seen.count + 1 : 1
    recent.set(viewer.id, { minute, count: taken })
    if (taken > PER_MINUTE) return
    const error = new Error(data.message)
    if (data.stack) error.stack = data.stack
    // As reportError groups it.
    const kind = fingerprintOf('client', messageOf(error).slice(0, 500))
    if (!(await worthRecording(db, kind, now))) return
    await reportError(getCloudflareEnv(), 'client', error, {
      viewerId: viewer.id,
      path: data.path,
      kind: data.kind,
    })
  })
