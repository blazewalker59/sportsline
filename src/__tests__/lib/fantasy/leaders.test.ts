import { describe, expect, it } from 'vitest'
import basketball from '../../fixtures/fantasy/basketball-category-matchup.json'
import type {
  LineupPlayer,
  MatchupSide,
  WireLeague,
} from '@/lib/fantasy/matchup'
import type { ScoringLeaders } from '@/lib/fantasy/leaders'
import {
  TOP_PLAYERS,
  currentLeaders,
  scoringLeaders,
} from '@/lib/fantasy/leaders'
import {
  readMatchup,
  readTeamSides,
  readTeamViews,
} from '@/lib/fantasy/matchup'

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

  it('ranks each position’s Players', () => {
    const qb = (id: number, pts: number) => ({
      ...player(id, pts),
      positionId: 1,
    })
    const rb = (id: number, pts: number) => ({
      ...player(id, pts),
      positionId: 2,
    })
    const read = scoringLeaders({
      sport: 'football',
      scoringPeriod: 5,
      sides: [
        side(1, 0, [qb(1, 20), rb(2, 30)]),
        side(2, 0, [qb(3, 25), rb(4, 0)]),
      ],
      mine: null,
      categories: null,
    })
    expect(
      read.positions?.map((g) => [
        g.positionId,
        g.players.map((p) => p.espnId),
      ]),
    ).toEqual([
      [1, [3, 1]],
      // No points: not a leader.
      [2, [2]],
    ])
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

  it('ranks every Category, rates and turnovers among them', () => {
    const labels = leaders.categories.map((c) => c.label)
    expect(labels).toEqual(
      expect.arrayContaining(['PTS', 'REB', 'FG%', 'FT%', 'TO']),
    )
    expect(leaders.players).toEqual([])
    expect(leaders.teams).toEqual([])
    for (const c of [
      ...leaders.categories,
      ...(leaders.matchupCategories ?? []),
    ]) {
      expect(c.players.length).toBeGreaterThan(0)
      expect(c.players.length).toBeLessThanOrEqual(TOP_PLAYERS)
    }
  })

  it('ranks the matchup from each side’s whole-matchup lines', () => {
    const sides = readTeamSides('basketball', league)
    const pts = leaders.matchupCategories?.find((c) => c.label === 'PTS')
    const best = Math.max(
      ...sides.flatMap((s) =>
        (s.summary ?? []).map((p) => p.dayStats?.[0] ?? 0),
      ),
    )
    expect(pts?.players[0].points).toBe(best)
  })

  it('ranks a count most first among every team’s Players today', () => {
    const sides = readTeamSides('basketball', league)
    for (const c of leaders.categories.filter((d) => !d.minimum)) {
      const counts = sides
        .flatMap((s) => s.lineup.map((p) => p.dayStats?.[c.statId] ?? 0))
        .filter((n) => n > 0)
        .sort((a, b) => b - a)
        .slice(0, TOP_PLAYERS)
      expect(c.players.map((p) => p.points)).toEqual(counts)
    }
  })
})

describe('scoringLeaders’ team ranks in a category league', () => {
  const league = basketball as unknown as WireLeague
  const views = readTeamViews('basketball', league)
  const read = (teamViews?: typeof views) =>
    scoringLeaders({
      sport: 'basketball',
      scoringPeriod: views[0].scoringPeriod,
      sides: views.map((v) => v.mine),
      mine: 1,
      categories: views[0].categories ?? null,
      teamViews,
    })

  it('ranks every team in each Category from its own totals', () => {
    const leaders = read(views)
    expect(leaders.matchupTeamCategories?.length).toBeGreaterThan(0)
    for (const c of leaders.matchupTeamCategories ?? []) {
      const totals = views.flatMap((v) => {
        const n = v.categories?.find((r) => r.statId === c.statId)?.mineValue
        return n == null ? [] : [n]
      })
      const best = c.reverse ? Math.min(...totals) : Math.max(...totals)
      const leader = views.find((v) => v.mine.teamId === c.teams[0].teamId)
      expect(
        leader?.categories?.find((r) => r.statId === c.statId)?.mineValue,
      ).toBe(best)
      expect(c.teams.length).toBe(totals.length)
    }
    expect(
      leaders.matchupTeamCategories?.[0].teams.find((t) => t.teamId === 1)
        ?.mine,
    ).toBe(true)
    expect(leaders.teamCategories).toBeDefined()
  })

  it('ranks no teams without every team’s Matchup (Sleeper)', () => {
    expect(read().matchupTeamCategories).toBeUndefined()
  })
})

describe('scoringLeaders’ rates and reverse counts', () => {
  const line = (espnId: number, dayStats: Record<string, number>) => ({
    ...player(espnId, null),
    dayStats,
  })
  const read = (lineup: Array<LineupPlayer>, reverse = true) =>
    scoringLeaders({
      sport: 'basketball',
      scoringPeriod: 1,
      sides: [side(1, 0, lineup)],
      mine: null,
      categories: [
        { statId: 19, label: 'FG%', reverse: false },
        { statId: 11, label: 'TO', reverse },
      ],
    })

  it('ranks a rate only with the volume behind it, its parts shown', () => {
    const leaders = read([
      // 2-2: too few shots to rank.
      line(1, { 13: 2, 14: 2 }),
      line(2, { 13: 6, 14: 10 }),
      line(3, { 13: 9, 14: 12 }),
    ])
    const fg = leaders.categories.find((c) => c.label === 'FG%')!
    expect(fg.minimum).toBe('5+ FGA')
    expect(fg.players.map((p) => [p.espnId, p.value, p.parts])).toEqual([
      [3, '.750', '9-12'],
      [2, '.600', '6-10'],
    ])
  })

  it('ranks a count where lower wins most first', () => {
    const leaders = read([
      line(1, { 11: 2 }),
      line(2, { 11: 5 }),
      line(3, { 11: 0 }),
    ])
    const to = leaders.categories.find((c) => c.label === 'TO')!
    expect(to.reverse).toBe(true)
    expect(to.players.map((p) => p.espnId)).toEqual([2, 1])
  })

  it('ranks a rate where lower wins lowest first', () => {
    const leaders = scoringLeaders({
      sport: 'baseball',
      scoringPeriod: 1,
      sides: [
        side(1, 0, [
          line(1, { 34: 18, 45: 1 }),
          line(2, { 34: 15, 45: 4 }),
          // One inning: not enough to rank.
          line(3, { 34: 3, 45: 0 }),
        ]),
      ],
      mine: null,
      categories: [{ statId: 47, label: 'ERA', reverse: true }],
    })
    expect(
      leaders.categories[0].players.map((p) => [p.espnId, p.value, p.parts]),
    ).toEqual([
      [1, '1.50', '6.0 IP'],
      [2, '7.20', '5.0 IP'],
    ])
  })
})

describe('currentLeaders', () => {
  it('drops leaders kept before Categories ranked their top Players', () => {
    const old = {
      scoringPeriod: 1,
      players: [],
      teams: [],
      categories: [{ statId: 0, label: 'PTS', value: '40', player: {} }],
    } as unknown as ScoringLeaders
    expect(currentLeaders(old)).toBeNull()
    const kept: ScoringLeaders = { ...old, categories: [] }
    expect(currentLeaders(kept)).toBe(kept)
    expect(currentLeaders(null)).toBeNull()
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
