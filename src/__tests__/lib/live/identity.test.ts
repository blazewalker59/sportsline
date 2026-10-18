/**
 * Resolving Source ids to Sportsline ids on the real migrations, including
 * a caller that loses the race to create them. Bun only.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type { Database } from '@/lib/db'
import type { SourceTeam } from '@/lib/model/types'
import { resolve } from '@/lib/live/identity'
import { players, sourceIds, teams } from '@/lib/db/schema'

const team = (sourceId: string): SourceTeam => ({
  sourceId,
  name: `Team ${sourceId}`,
  abbreviation: sourceId.toUpperCase(),
  logoUrl: `https://logos/${sourceId}.png`,
})

describe.skipIf(!isBun)('identity resolve', () => {
  let db: Database

  beforeEach(async () => {
    db = (await sqliteDb()).db as unknown as Database
  })

  /** A db whose batch lets `rival` finish its own resolve first. */
  function losing(rival: () => Promise<unknown>): Database {
    return new Proxy(db, {
      get(target, key, receiver) {
        if (key !== 'batch') return Reflect.get(target, key, receiver)
        return async (queries: Parameters<Database['batch']>[0]) => {
          await rival()
          return target.batch(queries)
        }
      },
    })
  }

  it('creates each Team once, with its mapping', async () => {
    const ids = await resolve(db, 'team', 'espn', 'nfl', [
      team('a'),
      team('b'),
      team('a'),
    ])
    expect(ids.size).toBe(2)
    const rows = await db.select().from(teams)
    expect(rows.map((r) => r.id).sort()).toEqual([...ids.values()].sort())
    expect(rows.find((r) => r.id === ids.get('a'))).toMatchObject({
      league: 'nfl',
      name: 'Team a',
      abbreviation: 'A',
      logoUrl: 'https://logos/a.png',
    })
    // Known ids are looked up, never recreated.
    const again = await resolve(db, 'team', 'espn', 'nfl', [team('b')])
    expect(again.get('b')).toBe(ids.get('b'))
    expect(await db.select().from(teams)).toHaveLength(2)
  })

  it('leaves no Team behind when a concurrent caller wins', async () => {
    let winner = new Map<string, string>()
    const loser = await resolve(
      losing(async () => {
        winner = await resolve(db, 'team', 'espn', 'nfl', [team('a')])
      }),
      'team',
      'espn',
      'nfl',
      [team('a'), team('b')],
    )
    expect(loser.get('a')).toBe(winner.get('a'))
    const rows = await db.select().from(teams)
    expect(rows.map((r) => r.id).sort()).toEqual([...loser.values()].sort())
    expect(await db.select().from(sourceIds)).toHaveLength(2)
  })

  it('leaves no Player behind when a concurrent caller wins', async () => {
    const refs = Array.from({ length: 60 }, (_, i) => ({
      sourceId: `p${i}`,
      name: `Player ${i}`,
    }))
    let winner = new Map<string, string>()
    const loser = await resolve(
      losing(async () => {
        winner = await resolve(db, 'player', 'espn', 'nba', refs.slice(0, 50))
      }),
      'player',
      'espn',
      'nba',
      refs,
    )
    for (const [sourceId, id] of winner) expect(loser.get(sourceId)).toBe(id)
    const rows = await db.select().from(players)
    expect(rows).toHaveLength(60)
    expect(rows.map((r) => r.id).sort()).toEqual([...loser.values()].sort())
    expect(rows[0]).toMatchObject({ league: 'nba', teamId: null })
  })

  it('maps Games without creating rows', async () => {
    const ids = await resolve(db, 'game', 'espn', 'nfl', [
      { sourceId: '401', name: '401' },
    ])
    expect(ids.get('401')).toMatch(/^gm_/)
    expect(await db.select().from(teams)).toHaveLength(0)
  })
})
