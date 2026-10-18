/**
 * The Timeline backlog's coverage condition: built without a database,
 * then run on the real migrations with Follow lists far past D1's 100
 * bound values (the SQLite helper holds queries to that limit). The
 * database half is Bun only.
 */

import { and, desc, eq } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { beforeEach, describe, expect, it } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type { SQL } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import type { Follow } from '@/lib/model/timeline'
import { coverageWhere } from '@/lib/timeline/coverage'
import { timelineItems } from '@/lib/db/schema'

const DAY = '2026-10-17'
const render = (where: SQL) => new SQLiteSyncDialect().sqlToQuery(where)
const teamsFollowed = (n: number): Array<Follow> =>
  Array.from({ length: n }, (_, i) => ({ kind: 'team', teamId: `tm_x${i}` }))
const playersFollowed = (n: number): Array<Follow> =>
  Array.from({ length: n }, (_, i) => ({
    kind: 'player',
    playerId: `pl_x${i}`,
  }))
const gamesFollowed = (n: number): Array<Follow> =>
  Array.from({ length: n }, (_, i) => ({ kind: 'game', gameId: `gm_x${i}` }))

describe('the coverage condition', () => {
  it('binds each id list once, however long', () => {
    const where = coverageWhere(
      [...teamsFollowed(500), ...playersFollowed(500), ...gamesFollowed(500)],
      { sportsDay: DAY },
    )!
    const { sql, params } = render(where)
    expect(sql).toContain('json_each')
    // Teams (both sides), Players, Games and the Routine test's two values.
    expect(params.length).toBeLessThan(10)
    expect(
      JSON.parse(params.find((p) => String(p).includes('tm_x'))! as string),
    ).toHaveLength(500)
  })

  it('binds a repeated League once', () => {
    const where = coverageWhere(
      Array.from({ length: 200 }, () => ({
        kind: 'league' as const,
        league: 'mlb' as const,
      })),
      { sportsDay: DAY, includeRoutine: true },
    )!
    expect(render(where).params).toEqual(['mlb'])
  })

  it('covers nothing without a Follow it can match', () => {
    expect(coverageWhere([], { sportsDay: DAY })).toBeNull()
    // Fantasy reads the signed-in Viewer's own Starters: no Viewer, nothing.
    expect(
      coverageWhere([{ kind: 'fantasy', playerIds: ['pl_a'] }], {
        sportsDay: DAY,
      }),
    ).toBeNull()
  })

  it("reads a Fantasy Follow's Starters by Viewer, not the sent ids", () => {
    const where = coverageWhere([{ kind: 'fantasy', playerIds: ['pl_sent'] }], {
      sportsDay: DAY,
      viewerId: 'u1',
    })!
    const { sql, params } = render(where)
    expect(sql).toContain('"fantasy_players"')
    expect(params).toContain('u1')
    expect(params).not.toContain('pl_sent')
  })
})

describe.skipIf(!isBun)('the coverage condition on SQLite', () => {
  let db: Database
  let sqlite: { run: (sql: string) => void }

  const item = (
    id: string,
    game: string,
    away: string,
    home: string,
    o: { kind?: string; significance?: string; at?: string } = {},
  ) =>
    sqlite.run(
      `INSERT INTO timeline_items (id, game_id, item_key, league, sports_day, away_team_id, home_team_id, kind, sequence, occurred_at, segment_label, away_score, home_score, description, significance, status, players)
       VALUES ('${id}', '${game}', '${id}', 'nfl', '${DAY}', '${away}', '${home}', '${o.kind ?? 'play'}', 1, '${o.at ?? '2026-10-17T20:00:00Z'}', 'Q1', 0, 0, 'x', '${o.significance ?? 'routine'}', 'active', '[]')`,
    )

  beforeEach(async () => {
    const fresh = await sqliteDb()
    db = fresh.db as unknown as Database
    sqlite = fresh.sqlite
    for (const t of ['tm_a', 'tm_b', 'tm_c', 'tm_d'])
      sqlite.run(
        `INSERT INTO teams (id, league, name, abbreviation) VALUES ('${t}', 'nfl', '${t}', '${t}')`,
      )
    for (const [g, away, home] of [
      ['gm_1', 'tm_a', 'tm_b'],
      ['gm_2', 'tm_c', 'tm_d'],
    ])
      sqlite.run(
        `INSERT INTO games (id, league, sports_day, starts_at, status, away_team_id, home_team_id, updated_at) VALUES ('${g}', 'nfl', '${DAY}', '2026-10-17T17:00:00Z', 'final', '${away}', '${home}', '')`,
      )
    item('it_1', 'gm_1', 'tm_a', 'tm_b')
    item('it_2', 'gm_2', 'tm_c', 'tm_d', { significance: 'scoring' })
    item('it_3', 'gm_2', 'tm_c', 'tm_d')
    sqlite.run(
      "INSERT INTO item_players (item_id, player_id) VALUES ('it_3', 'pl_star')",
    )
  })

  const covered = async (
    follows: Array<Follow>,
    includeRoutine = false,
  ): Promise<Array<string>> => {
    const where = coverageWhere(follows, { sportsDay: DAY, includeRoutine })
    if (!where) return []
    const rows = await db
      .select({ id: timelineItems.id })
      .from(timelineItems)
      .where(and(eq(timelineItems.sportsDay, DAY), where))
      .orderBy(desc(timelineItems.id))
    return rows.map((r) => r.id).sort()
  }

  it('finds a Team among hundreds of Follows, either side', async () => {
    expect(
      await covered([...teamsFollowed(300), { kind: 'team', teamId: 'tm_b' }]),
    ).toEqual(['it_1'])
  })

  it('finds a Player among hundreds of Follows', async () => {
    expect(
      await covered([
        ...playersFollowed(300),
        { kind: 'player', playerId: 'pl_star' },
      ]),
    ).toEqual(['it_3'])
  })

  it('finds a Game among hundreds, Routine Plays only when asked', async () => {
    const follows: Array<Follow> = [
      ...gamesFollowed(300),
      { kind: 'game', gameId: 'gm_2' },
    ]
    expect(await covered(follows)).toEqual(['it_2'])
    expect(await covered(follows, true)).toEqual(['it_2', 'it_3'])
  })

  it('mixes every kind in one statement', async () => {
    expect(
      await covered([
        ...teamsFollowed(200),
        ...playersFollowed(200),
        ...gamesFollowed(200),
        { kind: 'league', league: 'nfl' },
        { kind: 'team', teamId: 'tm_a' },
      ]),
    ).toEqual(['it_1', 'it_2'])
  })
})
