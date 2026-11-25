/**
 * Matching a Kalshi event to a Game. A schedule sync that fails is
 * reported (the health page reads error_events) and the match still
 * finishes. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type { KalshiAccount } from '@/lib/kalshi/client'

const state = vi.hoisted(() => ({
  db: null as unknown,
  syncError: null as Error | null,
  syncs: 0,
  start: new Date(Date.now() + 86_400_000).toISOString(),
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))
vi.mock('@/lib/live/schedule', () => ({
  syncLeague: () => {
    state.syncs += 1
    return state.syncError ? Promise.reject(state.syncError) : Promise.resolve()
  },
}))
vi.mock('@/lib/kalshi/client', () => ({
  milestoneFor: () =>
    Promise.resolve({
      id: 'ms1',
      start_date: state.start,
      details: {
        league: 'MLB',
        home_team_id: 'home',
        away_team_id: 'away',
      },
    }),
  target: (_account: unknown, id: string) =>
    Promise.resolve({
      id,
      type: 'baseball_team',
      name: id === 'home' ? 'New York' : 'Boston',
      details: {
        team_name: id === 'home' ? 'NY Yankees' : 'BOS Red Sox',
        league: 'MLB',
      },
    }),
}))

describe.skipIf(!isBun)('matching a Kalshi event', () => {
  const env = { DB: {} } as CloudflareEnv
  const account = { keyId: 'k', signer: {} } as KalshiAccount

  beforeEach(async () => {
    const fresh = await sqliteDb()
    state.db = fresh.db
    state.syncError = new Error('MLB StatsAPI 503 for schedule')
    state.syncs = 0
  })

  it('reports a failed schedule sync and still returns', async () => {
    const { gameFor } = await import('@/lib/kalshi/matching')
    const { errorEvents } = await import('@/lib/db/schema')
    const db = state.db as Db.Database
    const result = await gameFor(env, account, db, 'KXMLBGAME-26OCT11NYYBOS')
    expect(result).toEqual({ gameId: null, league: 'mlb' })
    expect(state.syncs).toBe(1)
    const rows = await db.select().from(errorEvents)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      scope: 'kalshi',
      message: 'MLB StatsAPI 503 for schedule',
    })
    expect(rows[0].context).toMatchObject({
      step: 'schedule',
      league: 'mlb',
    })
  })

  it('reads the League again for an event remembered without one', async () => {
    // Remembered before its League was known (as college basketball's
    // NCAAMB was): no League, and checked over half an hour ago.
    const { gameFor } = await import('@/lib/kalshi/matching')
    const { kalshiEvents } = await import('@/lib/db/schema')
    const db = state.db as Db.Database
    state.syncError = null
    await db.insert(kalshiEvents).values({
      eventTicker: 'KXMLBGAME-26OCT11NYYBOS',
      milestoneId: null,
      league: null,
      startsAt: null,
      homeName: null,
      awayName: null,
      gameId: null,
      checkedAt: new Date(Date.now() - 3_600_000).toISOString(),
    })
    const result = await gameFor(env, account, db, 'KXMLBGAME-26OCT11NYYBOS')
    expect(result.league).toBe('mlb')
    // It looked for the Game (its day's schedule), and remembers the League.
    expect(state.syncs).toBe(1)
    const [row] = await db.select().from(kalshiEvents)
    expect(row).toMatchObject({
      league: 'mlb',
      milestoneId: 'ms1',
      homeName: 'New York|NY Yankees',
      awayName: 'Boston|BOS Red Sox',
    })
  })
})
