/**
 * Opening an unstored Game from a Team page: which days and ids it takes,
 * and how often it syncs a League's day. Bun only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import { OpenTeamGameInput, RESYNC_AFTER_MS, openGame } from '@/lib/teams/games'
import { sourceIds } from '@/lib/db/schema'

const state = vi.hoisted(() => ({
  db: null as unknown,
  syncs: [] as Array<string>,
  /** What a sync stores: a mapping for this source game id. */
  stores: null as string | null,
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  getDb: () => state.db,
  getCloudflareEnv: () => ({}),
}))

vi.mock('@/lib/sources', () => ({
  sourceFor: () => ({ source: 'espn' }),
}))

vi.mock('@/lib/live/schedule', () => ({
  syncLeague: async (
    _env: unknown,
    league: string,
    sportsDay: string,
  ): Promise<void> => {
    state.syncs.push(`${league}:${sportsDay}`)
    if (!state.stores) return
    await (state.db as Awaited<ReturnType<typeof sqliteDb>>['db'])
      .insert(sourceIds)
      .values({
        entity: 'game',
        source: 'espn',
        sourceId: state.stores,
        internalId: 'gm_1',
      })
  },
}))

const NOW = new Date('2026-10-18T18:00:00Z')

const open = (sportsDay: string, sourceGameId = '401') =>
  openGame(
    OpenTeamGameInput.parse({ league: 'nfl', sourceGameId, sportsDay }),
    new Date(),
  )

describe.skipIf(!isBun)('openTeamGame', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    state.db = (await sqliteDb()).db
    state.syncs = []
    state.stores = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('syncs the day and returns the Game it stored', async () => {
    state.stores = '401'
    expect(await open('2026-10-12')).toEqual({ gameId: 'gm_1' })
    // Stored now: found without another sync.
    expect(await open('2026-10-12')).toEqual({ gameId: 'gm_1' })
    expect(state.syncs).toEqual(['nfl:2026-10-12'])
  })

  it('refuses days outside the backfill window', async () => {
    expect(await open('2026-09-01')).toBeNull()
    expect(await open('2026-10-30')).toBeNull()
    expect(state.syncs).toEqual([])
    // The edges: thirty days back, three ahead.
    await open('2026-09-18')
    await open('2026-10-21')
    expect(state.syncs).toEqual(['nfl:2026-09-18', 'nfl:2026-10-21'])
  })

  it('opens a stored Game outside the window, without a sync', async () => {
    await (state.db as Awaited<ReturnType<typeof sqliteDb>>['db'])
      .insert(sourceIds)
      .values({
        entity: 'game',
        source: 'espn',
        sourceId: '777',
        internalId: 'gm_old',
      })
    expect(await open('2026-09-03', '777')).toEqual({ gameId: 'gm_old' })
    expect(state.syncs).toEqual([])
  })

  it('rejects a source game id that is not a Source id', () => {
    expect(() => open('2026-10-12', '../summary?x=1')).toThrow()
    expect(() => open('2026-10-12', '')).toThrow()
    expect(() => open('2026-10-12', '9'.repeat(21))).toThrow()
    expect(state.syncs).toEqual([])
  })

  it('syncs a day once a minute however often it misses', async () => {
    await open('2026-10-05', '1')
    await open('2026-10-05', '2')
    await Promise.all([open('2026-10-05', '3'), open('2026-10-05', '4')])
    expect(state.syncs).toEqual(['nfl:2026-10-05'])
    vi.setSystemTime(NOW.getTime() + RESYNC_AFTER_MS)
    await open('2026-10-05', '5')
    expect(state.syncs).toEqual(['nfl:2026-10-05', 'nfl:2026-10-05'])
  })
})
