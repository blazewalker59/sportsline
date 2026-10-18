/**
 * The health page's server functions: a non-admin learns nothing about the
 * admins and isn't logged by email, and browser error reports are bounded
 * by what error_events already holds, whichever isolate takes them.
 * Through the Start compiler's provider module so the handlers run. Bun
 * only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
// @ts-expect-error The Start compiler's provider split is a query, not a TS path.
import * as provider from '@/lib/ops/server?tss-serverfn-split'
import { errorEvents } from '@/lib/db/schema'

type Opened = Awaited<ReturnType<typeof sqliteDb>>

interface Exec<T> {
  result?: T
  error?: unknown
}

type ServerFn = (opts: { data?: unknown }) => Promise<Exec<unknown>>

const state = vi.hoisted(() => ({
  opened: null as Opened | null,
  env: {} as CloudflareEnv,
  viewerId: 'u1',
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.opened?.db,
  getDb: () => state.opened?.db,
  getCloudflareEnv: () => state.env,
}))

vi.mock('@/lib/auth/server', () => ({
  getAuth: () => ({
    api: {
      getSession: () =>
        Promise.resolve({
          user: {
            id: state.viewerId,
            name: 'V',
            email: `${state.viewerId}@example.com`,
          },
        }),
    },
  }),
}))

const fns = provider as unknown as Record<string, ServerFn>

async function call<T>(name: string, data?: unknown): Promise<Exec<T>> {
  const { serverRequestContext } = await import('@/lib/db')
  const fn = fns[`${name}_createServerFn_handler`]
  return runWithStartContext(
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
        () => fn({ data }) as Promise<Exec<T>>,
      ),
  )
}

function opened(): Opened {
  if (!state.opened) throw new Error('db')
  return state.opened
}

describe.skipIf(!isBun)('ops server functions', () => {
  beforeEach(async () => {
    state.opened = await sqliteDb()
    state.env = {
      DB: {},
      ADMIN_EMAILS: 'admin@example.com',
    } as unknown as CloudflareEnv
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('tells a non-admin only who they are signed in as', async () => {
    state.viewerId = 'nosy'
    const denied = await call('getOpsHealth')
    expect(denied.result).toEqual({ denied: true, email: 'nosy@example.com' })
    const logged = JSON.stringify([
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.warn).mock.calls,
    ])
    expect(logged).not.toContain('nosy@example.com')
  })

  it('records a kind of browser error at most once a minute', async () => {
    state.viewerId = 'repeat'
    for (let i = 0; i < 3; i++) {
      const sent = await call('reportClientError', { message: 'Boom' })
      expect(sent.error).toBeUndefined()
    }
    const rows = await opened().db.select().from(errorEvents)
    expect(rows).toHaveLength(1)
    expect(rows[0].count).toBe(1)
  })

  it('stops taking new kinds once an hour has brought plenty', async () => {
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ'
    for (let i = 0; i < letters.length; i++) {
      // Spread over Viewers, past the per-isolate limit on each.
      state.viewerId = `flood-${Math.floor(i / 5)}`
      await call('reportClientError', { message: `Boom ${letters[i]}` })
    }
    expect(await opened().db.select().from(errorEvents)).toHaveLength(30)
  })
})
