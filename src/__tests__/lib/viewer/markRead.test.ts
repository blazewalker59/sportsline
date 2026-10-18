/**
 * The Read Marker's server function on the real migrations, through the
 * Start compiler's provider module so the handler actually runs. Bun only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import * as caller from '@/lib/viewer/server'
// Handler bodies are extracted here; the plain import only has RPC stubs.
// @ts-expect-error The Start compiler's provider split is a query, not a TS path.
import * as provider from '@/lib/viewer/server?tss-serverfn-split'

type Sqlite = Awaited<ReturnType<typeof sqliteDb>>['sqlite']
type AppDb = Awaited<ReturnType<typeof sqliteDb>>['db']
type ServerFn = (opts: { data?: unknown }) => Promise<{ error?: unknown }>

const state = vi.hoisted(() => ({
  db: null as AppDb | null,
  sqlite: null as Sqlite | null,
  env: { DB: {} } as unknown as CloudflareEnv,
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
  getDb: () => state.db,
  getCloudflareEnv: () => state.env,
}))

vi.mock('@/lib/auth/server', () => ({
  getAuth: () => ({
    api: {
      getSession: () =>
        Promise.resolve({
          user: { id: 'u1', name: 'Viewer', email: 'v@example.com' },
        }),
    },
  }),
}))

const fns = provider as unknown as Record<string, ServerFn>

async function markRead(readAt: string) {
  const { serverRequestContext } = await import('@/lib/db')
  const r = await runWithStartContext(
    {
      getRouter: () => ({}) as never,
      request: new Request('https://sportsline.dev/'),
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: 'serverFn',
    },
    () =>
      serverRequestContext.run(
        { headers: new Headers({ cookie: 'session' }), env: state.env },
        () => fns.markRead_createServerFn_handler({ data: { readAt } }),
      ),
  )
  if (r.error) throw r.error
}

const stored = () =>
  (
    state
      .sqlite!.query("SELECT read_at FROM read_markers WHERE viewer_id = 'u1'")
      .get() as { read_at: string } | null
  )?.read_at

describe.skipIf(!isBun)('the Read Marker', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-17T22:00:00.000Z'))
    const opened = await sqliteDb()
    state.db = opened.db
    state.sqlite = opened.sqlite
    state.sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the caller wrappers coverage measures', () => {
    expect(typeof caller.markRead).toBe('function')
  })

  it("is kept in UTC, in the Play's own form", async () => {
    await markRead('2026-10-17T20:00:00Z')
    expect(stored()).toBe('2026-10-17T20:00:00Z')
    await markRead('2026-10-17T16:30:00-04:00')
    expect(stored()).toBe('2026-10-17T20:30:00Z')
    await markRead('2026-10-17T20:31:00.250Z')
    expect(stored()).toBe('2026-10-17T20:31:00.250Z')
  })

  it('compares instants, not text, across offsets', async () => {
    await markRead('2026-10-17T21:00:00Z')
    // 20:30 UTC: later as text than "21:00…Z" would be, earlier in time.
    await markRead('2026-10-17T22:30:00+02:00')
    expect(stored()).toBe('2026-10-17T21:00:00Z')
  })

  it('never runs ahead of now', async () => {
    await markRead('2099-01-01T00:00:00Z')
    expect(stored()).toBe('2026-10-17T22:00:00.000Z')
  })

  it('moves past a stored marker that broke the rule', async () => {
    state.sqlite!.run(
      "INSERT INTO read_markers (viewer_id, read_at, updated_at) VALUES ('u1', '2099-01-01T00:00:00Z', '')",
    )
    await markRead('2026-10-17T20:00:00Z')
    expect(stored()).toBe('2026-10-17T20:00:00Z')
    state.sqlite!.run(
      "UPDATE read_markers SET read_at = '2026-10-17T19:00:00-04:00'",
    )
    await markRead('2026-10-17T21:00:00Z')
    expect(stored()).toBe('2026-10-17T21:00:00Z')
  })
})
