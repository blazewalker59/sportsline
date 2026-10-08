/**
 * Recording find_bet asks and following their picks, on the real
 * migrations; Kalshi's market results a stand-in. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type * as Record_ from '@/lib/sharp/trendRecord'
import type { TrendPick } from '@/lib/sharp/onDemand'

const state = vi.hoisted(() => ({
  db: null as unknown,
  results: {} as Record<string, string>,
}))
vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))
vi.mock('@/lib/sharp/kalshi', () => ({
  serviceAccount: () => Promise.resolve({ keyId: 'svc' }),
}))
vi.mock('@/lib/kalshi/client', () => ({
  markets: (_a: unknown, tickers: Array<string>) =>
    Promise.resolve(
      tickers.map((ticker) => ({
        ticker,
        result: state.results[ticker] ?? '',
      })),
    ),
}))

const env = { DB: {} } as CloudflareEnv
const caller = { viewerId: 'u1', tokenId: 't1', agentName: 'Grok' }
const pickOf = (
  ticker: string,
  side: 'yes' | 'no',
  startsAt: string,
): TrendPick =>
  ({
    ticker,
    side,
    key: { gameId: 'g1', kind: 'moneyline', teamId: 'col', line: null },
    title: `${ticker} ${side}`,
    gameLabel: 'COL @ ANA',
    league: 'nhl',
    startsAt,
    price: 0.5,
    fair: 0.55,
    trendChance: 0.65,
    edge: 0.03,
  }) as unknown as TrendPick

describe.skipIf(!isBun)('following find_bet', () => {
  let rec: typeof Record_
  let sqlite: {
    run: (sql: string) => void
    query: (sql: string) => { all: () => Array<Record<string, unknown>> }
  }
  let db: Db.Database

  beforeEach(async () => {
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite
    db = fresh.db as unknown as Db.Database
    state.db = db
    state.results = {}
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
    rec = await import('@/lib/sharp/trendRecord')
  })

  const rows = () =>
    sqlite
      .query(
        'SELECT id, placed_via, placed_cost, result, pnl FROM trend_picks ORDER BY id',
      )
      .all()

  it('records every ask, answered or not', async () => {
    await rec.recordRequest(
      db,
      caller,
      { team: 'Leafs', count: 3 },
      { games: [], picks: [], reason: 'No upcoming game' },
      new Date('2026-10-08T15:00:00Z'),
    )
    await rec.recordRequest(
      db,
      caller,
      { team: 'Avs', count: 3 },
      {
        games: [],
        picks: [
          pickOf('A', 'yes', '2026-10-09T02:00:00Z'),
          pickOf('B', 'no', '2026-10-09T02:00:00Z'),
        ],
        reason: null,
      },
      new Date('2026-10-08T15:00:00Z'),
    )
    const { stats } = await rec.viewerTrendRecord(db, 'u1')
    expect(stats).toMatchObject({
      requests: 2,
      answered: 1,
      picksOffered: 2,
      placed: 0,
    })
  })

  it('credits placements on Kalshi and by agents, then settles', async () => {
    const suggested = new Date('2026-10-08T15:00:00Z')
    await rec.recordRequest(
      db,
      caller,
      { team: 'Avs', count: 3 },
      {
        games: [],
        picks: [
          pickOf('A', 'yes', '2026-10-09T02:00:00Z'),
          pickOf('B', 'no', '2026-10-09T02:00:00Z'),
          pickOf('C', 'yes', '2026-10-09T02:00:00Z'),
        ],
        reason: null,
      },
      suggested,
    )
    // A: bought on Kalshi after it was suggested, since settled as won.
    sqlite.run(`INSERT INTO predictions (id,viewer_id,market_ticker,kind,side,title,contracts,cost,status,result,payout,pnl,opened_at,traded_at,updated_at)
      VALUES ('u1~A','u1','A','single','yes','A',10,5,'settled','won',10,5,'2026-10-08T16:05:00Z','2026-10-08T16:00:00Z','x')`)
    // B: an Agent's approved proposal that filled (not synced yet).
    sqlite.run(`INSERT INTO trade_proposals (id,viewer_id,token_id,agent_name,market_ticker,market_title,side,action,count,limit_cents,max_cost_dollars,status,created_at,expires_at,decided_at,filled_count,avg_price_dollars,fees_dollars)
      VALUES ('p1','u1','t1','Grok','B','B','no','buy',4,50,2.08,'filled','2026-10-08T15:01:00Z','2026-10-08T15:11:00Z','2026-10-08T15:02:00Z',4,0.5,0.08)`)
    // C: never placed.

    // Before the games: placements credited, nothing settled.
    await rec.trackTrendPicks(env, new Date('2026-10-08T20:00:00Z'))
    expect(rows()).toMatchObject([
      { placed_via: 'kalshi', placed_cost: 5, result: 'won', pnl: 5 },
      { placed_via: 'agent', placed_cost: 2.08, result: null },
      { placed_via: null, result: null },
    ])

    // After: Kalshi settles B (NO won) and C (YES lost).
    state.results = { B: 'no', C: 'no' }
    await rec.trackTrendPicks(env, new Date('2026-10-09T06:00:00Z'))
    expect(rows()).toMatchObject([
      { result: 'won' },
      { placed_via: 'agent', result: 'won' },
      { placed_via: null, result: 'lost' },
    ])
    const { stats } = await rec.viewerTrendRecord(db, 'u1')
    expect(stats).toMatchObject({
      placed: 2,
      placedVia: { agent: 1, kalshi: 1 },
      won: 2,
      lost: 0,
      winRate: 1,
      skipped: { won: 0, lost: 1, pending: 0 },
    })
  })
})
