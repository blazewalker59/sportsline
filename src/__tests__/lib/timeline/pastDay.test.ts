/**
 * Loading a past Sports Day, on the real migrations with the Sources'
 * schedules stood in for. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type { Database } from '@/lib/db'
import type { League } from '@/lib/model/types'
import { EMPTY_DAY_MS, syncPastDay } from '@/lib/timeline/pastDay'

const DAY = '2026-10-10'
const LEAGUES: Array<League> = ['mlb', 'nfl']
const now = new Date('2026-10-17T16:00:00Z')

describe.skipIf(!isBun)('loading a past Sports Day', () => {
  let db: Database
  let sqlite: { run: (sql: string) => void }

  beforeEach(async () => {
    const fresh = await sqliteDb()
    db = fresh.db as unknown as Database
    sqlite = fresh.sqlite
    for (const t of ['tm_a', 'tm_b'])
      sqlite.run(
        `INSERT INTO teams (id, league, name, abbreviation) VALUES ('${t}', 'nfl', '${t}', '${t}')`,
      )
  })

  const storeGame = (league: League) =>
    sqlite.run(
      `INSERT INTO games (id, league, sports_day, starts_at, status, away_team_id, home_team_id, updated_at) VALUES ('gm_${league}', '${league}', '${DAY}', '${DAY}T17:00:00Z', 'final', 'tm_a', 'tm_b', '')`,
    )

  it("asks a League's Source once when it has no Games that day", async () => {
    const sync = vi.fn(() => Promise.resolve())
    expect(await syncPastDay(db, DAY, now, LEAGUES, sync)).toEqual({
      games: 0,
      synced: true,
      failures: [],
    })
    expect(sync).toHaveBeenCalledTimes(2)
    expect(await syncPastDay(db, DAY, now, LEAGUES, sync)).toEqual({
      games: 0,
      synced: false,
      failures: [],
    })
    expect(sync).toHaveBeenCalledTimes(2)
  })

  it('asks again once the empty answer is old', async () => {
    const sync = vi.fn(() => Promise.resolve())
    await syncPastDay(db, DAY, now, LEAGUES, sync)
    const later = new Date(now.getTime() + EMPTY_DAY_MS + 1)
    await syncPastDay(db, DAY, later, LEAGUES, sync)
    expect(sync).toHaveBeenCalledTimes(4)
  })

  it("doesn't remember a League whose Source failed", async () => {
    const sync = vi.fn((league: League) =>
      league === 'mlb' ? Promise.reject(new Error('503')) : Promise.resolve(),
    )
    const first = await syncPastDay(db, DAY, now, LEAGUES, sync)
    expect(first.failures).toHaveLength(1)
    await syncPastDay(db, DAY, now, LEAGUES, sync)
    expect(sync.mock.calls.map(([l]) => l)).toEqual(['mlb', 'nfl', 'mlb'])
  })

  it('reports the Games a sync found, and skips a day already stored', async () => {
    const sync = vi.fn((league: League) => {
      if (league === 'nfl') storeGame('nfl')
      return Promise.resolve()
    })
    expect(await syncPastDay(db, DAY, now, LEAGUES, sync)).toEqual({
      games: 1,
      synced: true,
      failures: [],
    })
    expect(await syncPastDay(db, DAY, now, LEAGUES, sync)).toEqual({
      games: 1,
      synced: false,
      failures: [],
    })
    expect(sync).toHaveBeenCalledTimes(2)
  })
})
