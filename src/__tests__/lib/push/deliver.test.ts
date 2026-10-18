/**
 * Following Alerts for more devices than one statement can bind, on the
 * real migrations; Web Push a stand-in. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type { Database } from '@/lib/db'
import type { TimelineItem } from '@/lib/model/timeline'
import { deliverAlerts } from '@/lib/push/deliver'

vi.mock('@/lib/push/webpush', () => ({
  // Every device has gone away since it subscribed.
  sendPush: () => Promise.resolve('gone'),
}))

const DEVICES = 120

describe.skipIf(!isBun)('Following Alerts for many devices', () => {
  let db: Database
  let sqlite: {
    run: (sql: string) => void
    query: (sql: string) => { get: () => unknown }
  }

  beforeEach(async () => {
    const fresh = await sqliteDb()
    db = fresh.db as unknown as Database
    sqlite = fresh.sqlite
    for (let i = 0; i < DEVICES; i++) {
      sqlite.run(
        `INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u${i}','V','v${i}@example.com',1,0,0)`,
      )
      sqlite.run(
        `INSERT INTO push_subscriptions (endpoint, viewer_id, p256dh, auth, created_at) VALUES ('https://push/${i}','u${i}','k','a','')`,
      )
      sqlite.run(
        `INSERT INTO follows (viewer_id, kind, target, created_at) VALUES ('u${i}','team','a','')`,
      )
    }
  })

  it('forgets every device that is gone', async () => {
    const touchdown: TimelineItem = {
      id: 'g1~play:1',
      gameId: 'g1',
      league: 'nfl',
      sportsDay: '2026-10-01',
      kind: 'play',
      side: 'away',
      sequence: 1,
      occurredAt: new Date().toISOString(),
      segmentLabel: 'Q4 1:42',
      score: { away: 24, home: 24 },
      awayTeam: { id: 'a', abbreviation: 'PIT', logoUrl: null },
      homeTeam: { id: 'h', abbreviation: 'CLE', logoUrl: null },
      description: 'A.Rodgers pass short right to P.Freiermuth, TOUCHDOWN.',
      playType: 'Passing Touchdown',
      significance: 'scoring',
      milestone: null,
      status: 'active',
      revisedAt: null,
      overturnOf: null,
      players: [],
      detail: null,
    }
    const keys = { publicKey: 'pub', privateJwk: '{}', subject: 'x' }
    expect(
      await deliverAlerts(db, keys, [touchdown], () => Promise.resolve(true)),
    ).toEqual({ sent: 0, pruned: DEVICES })
    expect(
      sqlite.query('SELECT count(*) AS n FROM push_subscriptions').get(),
    ).toEqual({ n: 0 })
  })
})
