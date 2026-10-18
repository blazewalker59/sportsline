/**
 * Prediction Alerts for more Viewers than one statement can bind, on the
 * real migrations; Web Push a stand-in. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'

const state = vi.hoisted(() => ({
  db: null as unknown,
  sent: [] as Array<string>,
}))
vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))
vi.mock('@/lib/push/webpush', () => ({
  // Every device has gone away since it subscribed.
  sendPush: (device: { endpoint: string }) => {
    state.sent.push(device.endpoint)
    return Promise.resolve('gone')
  },
}))

const env = {
  DB: {},
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_JWK: '{}',
} as unknown as CloudflareEnv
const VIEWERS = 120

describe.skipIf(!isBun)('Prediction Alerts for many Viewers', () => {
  let sqlite: {
    run: (sql: string) => void
    query: (sql: string) => { get: () => unknown }
  }

  beforeEach(async () => {
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite
    state.db = fresh.db
    state.sent = []
    const settledAt = new Date(Date.now() - 60_000).toISOString()
    for (let i = 0; i < VIEWERS; i++) {
      sqlite.run(
        `INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u${i}','V','v${i}@example.com',1,0,0)`,
      )
      sqlite.run(
        `INSERT INTO push_subscriptions (endpoint, viewer_id, p256dh, auth, created_at) VALUES ('https://push/${i}','u${i}','k','a','')`,
      )
      // Seen before (it has a baseline), and just settled as won.
      sqlite.run(`INSERT INTO predictions (id,viewer_id,market_ticker,kind,side,title,contracts,cost,alert_chance,status,result,pnl,opened_at,settled_at,updated_at)
        VALUES ('p${i}','u${i}','T${i}','single','yes','T${i}',10,5,0.5,'settled','won',5,'2026-10-08T16:00:00Z','${settledAt}','x')`)
    }
  })

  it('tells each one their result, and forgets devices that are gone', async () => {
    const { sendPredictionAlerts } = await import('@/lib/push/predictionAlerts')
    await sendPredictionAlerts(env)
    expect(state.sent).toHaveLength(VIEWERS)
    expect(
      sqlite.query('SELECT count(*) AS n FROM push_subscriptions').get(),
    ).toEqual({ n: 0 })
  })
})
