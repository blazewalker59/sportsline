/**
 * Saving a device for Alerts: only push services' endpoints, never another
 * Viewer's, and a handful a Viewer. Through the Start compiler's provider
 * module so the handlers run. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import * as caller from '@/lib/push/server'
// @ts-expect-error The Start compiler's provider split is a query, not a TS path.
import * as provider from '@/lib/push/server?tss-serverfn-split'
import { isPushEndpoint, sendPush } from '@/lib/push/webpush'
import { pushSubscriptions } from '@/lib/db/schema'

type AppDb = Awaited<ReturnType<typeof sqliteDb>>['db']

interface Exec<T> {
  result?: T
  error?: unknown
}

type ServerFn = (opts: { data?: unknown }) => Promise<Exec<unknown>>

const state = vi.hoisted(() => ({
  db: null as AppDb | null,
  // No VAPID keys: saving skips the welcome push.
  env: { DB: {} } as unknown as CloudflareEnv,
  viewer: 'u1',
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  getDb: () => state.db,
  getCloudflareEnv: () => state.env,
}))

vi.mock('@/lib/auth/server', () => ({
  getAuth: () => ({
    api: {
      getSession: () =>
        Promise.resolve({
          user: { id: state.viewer, name: 'V', email: 'v@example.com' },
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

const keys = { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) }

function subscription(endpoint: string, k = keys) {
  return { endpoint, keys: k }
}

async function rows() {
  return state
    .db!.select()
    .from(pushSubscriptions)
    .orderBy(pushSubscriptions.createdAt)
}

describe('push endpoints', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/QH/abc',
  ])('accepts %s', (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(true)
  })

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.example/abc',
    'https://evilpush.services.mozilla.com/abc',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/abc',
    'not a url',
  ])('refuses %s', (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(false)
  })

  it('never sends to an endpoint off the push services', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const result = await sendPush(
      { endpoint: 'https://internal.example/hook', ...keys },
      '{}',
      { publicKey: 'k', privateJwk: '{}', subject: 'https://sportsline.dev' },
    )
    expect(result).toBe('gone')
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe.skipIf(!isBun)('saving a device for Alerts', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-08T18:00:00.000Z'))
    const opened = await sqliteDb()
    state.db = opened.db
    state.viewer = 'u1'
    opened.sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0),('u2','W','w@example.com',1,0,0)",
    )
    return () => vi.useRealTimers()
  })

  it('loads the caller wrappers coverage measures', () => {
    expect(typeof caller.savePushSubscription).toBe('function')
  })

  it('refuses an endpoint that is not a push service', async () => {
    const saved = await call('savePushSubscription', {
      endpoint: 'http://internal.example/hook',
      keys,
    })
    expect(saved.error).toBeTruthy()
    expect(await rows()).toEqual([])
  })

  it('keeps an endpoint with the Viewer who saved it', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/one'
    expect(
      (await call('savePushSubscription', subscription(endpoint))).result,
    ).toEqual({ confirmed: false })

    state.viewer = 'u2'
    const other = await call('savePushSubscription', {
      endpoint,
      keys: { p256dh: 'x'.repeat(87), auth: 'y'.repeat(22) },
    })
    expect(other.result).toEqual({ confirmed: false, taken: true })
    expect(
      (await rows()).map((r) => [r.endpoint, r.viewerId, r.p256dh]),
    ).toEqual([[endpoint, 'u1', keys.p256dh]])

    // The owner refreshing its keys still works.
    state.viewer = 'u1'
    const fresh = { p256dh: 'z'.repeat(87), auth: 'w'.repeat(22) }
    await call('savePushSubscription', subscription(endpoint, fresh))
    expect((await rows())[0]?.p256dh).toBe(fresh.p256dh)
  })

  it('keeps ten devices a Viewer, dropping the oldest', async () => {
    for (let n = 0; n < 12; n++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 8, 18, n)))
      const saved = await call(
        'savePushSubscription',
        subscription(`https://fcm.googleapis.com/fcm/send/${n}`),
      )
      expect(saved.error).toBeUndefined()
    }
    state.viewer = 'u2'
    await call(
      'savePushSubscription',
      subscription('https://web.push.apple.com/QH/theirs'),
    )
    const all = await rows()
    const mine = all.filter((r) => r.viewerId === 'u1')
    expect(mine).toHaveLength(caller.DEVICES_PER_VIEWER)
    expect(mine.map((r) => r.endpoint.split('/').at(-1))).toEqual([
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
    ])
    expect(all.filter((r) => r.viewerId === 'u2')).toHaveLength(1)
  })
})
