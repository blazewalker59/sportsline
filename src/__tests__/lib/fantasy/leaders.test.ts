import { describe, expect, it } from 'vitest'
import basketball from '../../fixtures/fantasy/basketball-category-matchup.json'
import type {
  LineupPlayer,
  MatchupSide,
  WireLeague,
} from '@/lib/fantasy/matchup'
import { TOP_PLAYERS, scoringLeaders } from '@/lib/fantasy/leaders'
import { readMatchup, readTeamSides } from '@/lib/fantasy/matchup'

const player = (
  espnId: number,
  points: number | null,
  starter = true,
): LineupPlayer => ({
  espnId,
  name: `Player ${espnId}`,
  slot: starter ? 'QB' : 'Bench',
  slotId: starter ? 0 : 20,
  positionId: 1,
  starter,
  points,
  projected: null,
  proTeamId: 1,
  injury: null,
  breakdown: [],
})

const side = (
  teamId: number,
  score: number,
  lineup: Array<LineupPlayer>,
): MatchupSide => ({
  teamId,
  name: `Team ${teamId}`,
  abbrev: `T${teamId}`,
  logo: null,
  record: null,
  score,
  projected: null,
  lineup,
})

describe('scoringLeaders in a points league', () => {
  const sides = [
    side(1, 98.4, [player(11, 31.2), player(12, 4), player(13, 40.1, false)]),
    side(2, 120.7, [player(21, 18), player(22, null), player(23, 0)]),
  ]
  const leaders = scoringLeaders({
    sport: 'football',
    scoringPeriod: 5,
    sides,
    mine: 2,
    categories: null,
  })

  it('ranks every rostered Player by points, the bench marked', () => {
    expect(leaders.players.map((p) => [p.espnId, p.points, p.starter])).toEqual(
      [
        [13, 40.1, false],
        [11, 31.2, true],
        [21, 18, true],
        [12, 4, true],
      ],
    )
    expect(leaders.players[0]).toMatchObject({
      fantasyTeamId: 1,
      fantasyTeam: 'T1',
      mine: false,
    })
    expect(leaders.players[2].mine).toBe(true)
  })

  it('ranks every team by its score', () => {
    expect(leaders.teams.map((t) => [t.teamId, t.score, t.mine])).toEqual([
      [2, 120.7, true],
      [1, 98.4, false],
    ])
    expect(leaders.categories).toEqual([])
  })

  it('lists only the top players', () => {
    const many = side(
      3,
      0,
      Array.from({ length: 20 }, (_, i) => player(100 + i, i + 1)),
    )
    const top = scoringLeaders({
      sport: 'football',
      scoringPeriod: 5,
      sides: [many],
      mine: null,
      categories: null,
    })
    expect(top.players).toHaveLength(TOP_PLAYERS)
    expect(top.players[0].points).toBe(20)
  })
})

describe('scoringLeaders in a category league', () => {
  const league = basketball as unknown as WireLeague
  const view = readMatchup('basketball', league, 1)!
  const leaders = scoringLeaders({
    sport: 'basketball',
    scoringPeriod: view.scoringPeriod,
    sides: readTeamSides('basketball', league),
    mine: 1,
    categories: view.categories ?? null,
  })

  it('names a leader for counting Categories only', () => {
    const labels = leaders.categories.map((c) => c.label)
    expect(labels.length).toBeGreaterThan(0)
    // Rates need volume; turnovers lead nothing.
    expect(labels).not.toContain('FG%')
    expect(labels).not.toContain('FT%')
    expect(labels).not.toContain('TO')
    expect(leaders.players).toEqual([])
    expect(leaders.teams).toEqual([])
  })

  it('picks the most of each among every team’s Players today', () => {
    const sides = readTeamSides('basketball', league)
    for (const c of leaders.categories) {
      const best = Math.max(
        ...sides.flatMap((s) =>
          s.lineup.map((p) => p.dayStats?.[c.statId] ?? 0),
        ),
      )
      expect(c.player.points).toBe(best)
    }
  })
})

describe('readTeamSides', () => {
  it('reads every team in the league as a side', () => {
    const sides = readTeamSides(
      'basketball',
      basketball as unknown as WireLeague,
    )
    expect(sides.map((s) => s.teamId).sort()).toEqual([1, 2])
    expect(sides.every((s) => s.lineup.length > 0)).toBe(true)
  })
})
