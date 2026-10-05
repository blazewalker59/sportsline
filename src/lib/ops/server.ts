/**
 * The health page's reads (admins only) and the browser's error reports
 * (docs/adr/0005).
 */

import { createServerFn } from '@tanstack/react-start'
import { desc } from 'drizzle-orm'
import { z } from 'zod'
import { isAdmin, reportError } from './errors'
import { isStale } from './jobs'
import { getCloudflareEnv, getDb } from '@/lib/db'
import {
  errorEvents,
  espnAccounts,
  jobRuns,
  kalshiAccounts,
  sleeperAccounts,
  user,
} from '@/lib/db/schema'
import { requireViewer } from '@/lib/viewer/session'

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

export interface OpsHealth {
  jobs: Array<JobView>
  accounts: Array<AccountView>
  errors: Array<ErrorView>
}

export const getOpsHealth = createServerFn({ method: 'GET' }).handler(
  async (): Promise<OpsHealth | null> => {
    const viewer = await requireViewer()
    const env = getCloudflareEnv()
    if (!isAdmin(env, viewer.email)) return null
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
  },
)

/** Browser errors this isolate has taken per Viewer this minute. */
const recent = new Map<string, { minute: number; count: number }>()
const PER_MINUTE = 10

/** A crash or unhandled failure in the browser, reported to the same place. */
export const reportClientError = createServerFn({ method: 'POST' })
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
  .handler(async ({ data }) => {
    const viewer = await requireViewer()
    const minute = Math.floor(Date.now() / 60_000)
    const seen = recent.get(viewer.id)
    const count = seen?.minute === minute ? seen.count + 1 : 1
    recent.set(viewer.id, { minute, count })
    if (count > PER_MINUTE) return
    const error = new Error(data.message)
    if (data.stack) error.stack = data.stack
    await reportError(getCloudflareEnv(), 'client', error, {
      viewerId: viewer.id,
      path: data.path,
      kind: data.kind,
    })
  })
