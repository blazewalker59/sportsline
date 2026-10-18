/**
 * Reporting an error: grouped in error_events, and the admins pushed at
 * most every few hours, or not at all when asked only to log. Real
 * migrations on Bun's SQLite; delivery is a stand-in. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type * as Errors from '@/lib/ops/errors'

const state = vi.hoisted(() => ({ db: null as unknown, pushes: 0 }))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))

vi.mock('@/lib/push/webpush', () => ({
  sendPush: () => {
    state.pushes++
    return Promise.resolve()
  },
}))

const env = {
  DB: {},
  ADMIN_EMAILS: 'admin@example.com',
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_JWK: '{}',
} as unknown as CloudflareEnv

describe.skipIf(!isBun)('reportError', () => {
  let reportError: typeof Errors.reportError
  let sqlite: {
    run: (sql: string) => void
    query: (sql: string) => { get: () => Record<string, unknown> }
  }

  beforeEach(async () => {
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite as typeof sqlite
    state.db = fresh.db
    state.pushes = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('a1','Admin','admin@example.com',1,0,0)",
    )
    sqlite.run(
      "INSERT INTO push_subscriptions (endpoint,viewer_id,p256dh,auth,created_at) VALUES ('https://push.example/1','a1','p','a','2026-10-01T00:00:00Z')",
    )
    ;({ reportError } = await import('@/lib/ops/errors'))
  })

  const logged = () =>
    sqlite.query('SELECT scope, count, notified_at FROM error_events').get()

  it('logs without pushing when asked only to log', async () => {
    await reportError(
      env,
      'source-fallback',
      new Error('ESPN 403'),
      {},
      {
        notify: false,
      },
    )
    await reportError(
      env,
      'source-fallback',
      new Error('ESPN 403'),
      {},
      {
        notify: false,
      },
    )
    expect(logged()).toMatchObject({ scope: 'source-fallback', count: 2 })
    expect(logged().notified_at).toBeNull()
    expect(state.pushes).toBe(0)
  })

  it('pushes the admins on a new kind of error, then holds off', async () => {
    await reportError(env, 'kalshi', new Error('Kalshi 500'))
    await reportError(env, 'kalshi', new Error('Kalshi 500'))
    expect(logged()).toMatchObject({ scope: 'kalshi', count: 2 })
    expect(state.pushes).toBe(1)
  })
})
