import { describe, expect, it } from 'vitest'
import basketball from '../../fixtures/fantasy/basketball-category-matchup.json'
import football from '../../fixtures/fantasy/football-matchup-2026-week-1.json'
import type { MatchupView, WireLeague } from '@/lib/fantasy/matchup'
import type { CloudflareEnv } from '@/lib/db'
import type { fantasyLeagues } from '@/lib/db/schema'
import { readLeagueMatchups, readMatchup } from '@/lib/fantasy/matchup'
import {
  readSleeperLeagueMatchups,
  readSleeperMatchup,
} from '@/lib/fantasy/sleeper/read'
import { isOtherMatchup, readLeagueMatchup } from '@/lib/fantasy/sync'

type Schedule = NonNullable<WireLeague['schedule']>
type Side = NonNullable<Schedule[number]['home']>

/**
 * The fixture's league grown to more teams: each new team a copy of one
 * of the fixture's two, renamed, so every Matchup has real Lineups.
 */
function grown(
  base: WireLeague,
  copies: Array<{ id: number; from: number; name: string }>,
  schedule: Schedule,
): WireLeague {
  const teams = base.teams!
  return {
    ...base,
    teams: [
      ...teams,
      ...copies.map((c) => ({
        ...teams.find((t) => t.id === c.from)!,
        id: c.id,
        name: c.name,
        abbrev: c.name.slice(0, 3).toUpperCase(),
      })),
    ],
    schedule: [...base.schedule!, ...schedule],
  }
}

/** A side of the fixture's Matchup, as another team's. */
function sideAs(base: WireLeague, from: number, teamId: number): Side {
  const game = base.schedule![0]
  const side = game.home?.teamId === from ? game.home : game.away
  return { ...side, teamId }
}

describe('the other Matchups in an ESPN points league', () => {
  const base = football as unknown as WireLeague
  // The Viewer is team 6 (against 5) in period 1.
  const league = grown(
    base,
    [
      { id: 7, from: 5, name: 'Gamma' },
      { id: 8, from: 6, name: 'Delta' },
      { id: 9, from: 5, name: 'Epsilon' },
    ],
    [
      {
        matchupPeriodId: 1,
        away: sideAs(base, 5, 7),
        home: sideAs(base, 6, 8),
      },
      // A bye: only a home side.
      { matchupPeriodId: 1, home: sideAs(base, 5, 9) },
      // Another period's Matchup isn't this one's.
      {
        matchupPeriodId: 2,
        away: sideAs(base, 6, 7),
        home: sideAs(base, 5, 6),
      },
    ],
  )
  const others = readLeagueMatchups('football', league, 6)

  it('lists every Matchup this period but the Viewer’s', () => {
    expect(others.map((o) => [o.left.teamId, o.right?.teamId ?? null])).toEqual(
      [
        [7, 8],
        [9, null],
      ],
    )
  })

  it('reads each the way the Viewer’s is read, its away team on the left', () => {
    const full = readMatchup('football', league, 7)!
    expect(others[0]).toEqual({
      left: {
        teamId: 7,
        name: 'Gamma',
        abbrev: 'GAM',
        logo: full.mine.logo,
        record: full.mine.record,
        score: full.mine.score,
      },
      right: expect.objectContaining({
        teamId: 8,
        name: 'Delta',
        score: full.opponent!.score,
      }),
    })
  })

  it('is empty in a league of two', () => {
    expect(readLeagueMatchups('football', base, 6)).toEqual([])
  })
})

describe('the other Matchups in an ESPN category league', () => {
  const base = basketball as unknown as WireLeague
  const period = base.status!.currentMatchupPeriod!
  const [mine, theirs] = [base.schedule![0].home!, base.schedule![0].away!]
  const league = grown(
    base,
    [
      { id: 3, from: mine.teamId!, name: 'Gamma' },
      { id: 4, from: theirs.teamId!, name: 'Delta' },
    ],
    [
      {
        matchupPeriodId: period,
        away: sideAs(base, mine.teamId!, 3),
        home: sideAs(base, theirs.teamId!, 4),
      },
    ],
  )

  it('scores each by the categories it leads, with ties', () => {
    const [other] = readLeagueMatchups('basketball', league, mine.teamId!)
    const full = readMatchup('basketball', league, 3)!
    expect(other.left.score).toBe(full.mine.score)
    expect(other.right?.score).toBe(full.opponent!.score)
    expect(other.ties ?? 0).toBe(full.ties ?? 0)
    expect(other.left.score + other.right!.score + (other.ties ?? 0)).toBe(
      full.categories!.length,
    )
  })
})

describe('the other Matchups in a Sleeper league', () => {
  const roster = (id: number) => ({
    roster_id: id,
    owner_id: `u${id}`,
    starters: [],
    players: [],
    settings: { wins: id, losses: 1 },
  })
  const input = {
    league: { league_id: 'L1', name: 'Dynasty', roster_positions: ['QB'] },
    rosters: [3, 7, 1, 5, 9].map(roster),
    users: [3, 7, 1, 5, 9].map((id) => ({
      user_id: `u${id}`,
      display_name: `Team ${id}`,
    })),
    matchups: [
      { roster_id: 3, matchup_id: 2, points: 88.4 },
      { roster_id: 7, matchup_id: 2, points: 70.1 },
      { roster_id: 5, matchup_id: 1, points: 91 },
      { roster_id: 1, matchup_id: 1, points: 64.5 },
      { roster_id: 9, matchup_id: null, points: 0 },
    ],
    week: 4,
    data: { info: new Map(), stats: new Map(), projections: new Map() },
  }
  const others = readSleeperLeagueMatchups(input, 3)

  it('pairs rosters by matchup, the lower on the left, byes last', () => {
    expect(others.map((o) => [o.left.teamId, o.right?.teamId ?? null])).toEqual(
      [
        [1, 5],
        [9, null],
      ],
    )
  })

  it('keeps each side’s name, record and points', () => {
    expect(others[0].left).toMatchObject({
      name: 'Team 1',
      record: '1-1',
      score: 64.5,
    })
    expect(others[0].right).toMatchObject({ name: 'Team 5', score: 91 })
    // As the Viewer's own would read for that roster.
    const full = readSleeperMatchup({ ...input, mine: input.rosters[2] })
    expect(others[0].right?.score).toBe(full.opponent?.score)
  })
})

describe('opening another Matchup', () => {
  const m = {
    others: [
      {
        left: {
          teamId: 7,
          name: 'G',
          abbrev: 'G',
          logo: null,
          record: null,
          score: 1,
        },
        right: {
          teamId: 8,
          name: 'D',
          abbrev: 'D',
          logo: null,
          record: null,
          score: 2,
        },
      },
    ],
  } as unknown as MatchupView
  const row = {
    id: 'v1~football~L1',
    viewerId: 'v1',
    provider: 'espn',
    matchup: m,
  } as unknown as typeof fantasyLeagues.$inferSelect
  // Refused before anything is read: no ESPN session or database needed.
  const env = {} as CloudflareEnv

  it('takes only a Matchup’s left team from the league’s scoreboard', () => {
    expect(isOtherMatchup(m, 7)).toBe(true)
    expect(isOtherMatchup(m, 8)).toBe(false)
    expect(isOtherMatchup({ ...m, others: undefined }, 7)).toBe(false)
  })

  it('reads nothing for another Viewer’s league or a team not in it', async () => {
    await expect(readLeagueMatchup(env, 'v2', row, 7)).resolves.toBeNull()
    await expect(readLeagueMatchup(env, 'v1', row, 42)).resolves.toBeNull()
  })
})
