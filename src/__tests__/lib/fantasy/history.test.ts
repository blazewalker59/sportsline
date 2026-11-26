import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WireLeague } from '@/lib/fantasy/matchup'
import type { HistorySeason } from '@/lib/fantasy/history'
import type {
  SleeperBracketGame,
  SleeperLeague,
  SleeperMatchup,
} from '@/lib/fantasy/sleeper/client'
import { readEspnSeason, summarizeHistory } from '@/lib/fantasy/history'
import { readSleeperSeason } from '@/lib/fantasy/sleeper/history'
import { seasonLeague } from '@/lib/fantasy/client'

const A = '{AAAA}'
const B = '{BBBB}'
const C = '{CCCC}'
const D = '{DDDD}'

type Entry = NonNullable<WireLeague['schedule']>[number]

const game = (
  period: number,
  home: number,
  hp: number,
  away: number | null,
  ap: number,
  tier = 'NONE',
): Entry => ({
  matchupPeriodId: period,
  playoffTierType: tier,
  home: { teamId: home, totalPoints: hp, cumulativeScore: { wins: hp } },
  ...(away === null
    ? {}
    : {
        away: { teamId: away, totalPoints: ap, cumulativeScore: { wins: ap } },
      }),
  winner:
    away === null ? 'UNDECIDED' : hp > ap ? 'HOME' : hp < ap ? 'AWAY' : 'TIE',
})

/**
 * Four teams, two make the playoffs: seed 1 (team 1) has a bye-free
 * bracket; team 4, seeded last of the two, wins the final. The seed
 * order doesn't name the champion: the final does.
 */
const espnSeason = (over: Partial<WireLeague> = {}): WireLeague => ({
  seasonId: 2024,
  status: {
    latestScoringPeriod: 19,
    finalScoringPeriod: 17,
    previousSeasons: [2021, 2022, 2023, 2024, 2025],
  },
  settings: {
    name: 'The League',
    scoringSettings: { scoringType: 'H2H_POINTS' },
    scheduleSettings: { matchupPeriodCount: 2, playoffTeamCount: 2 },
  },
  members: [
    { id: A, firstName: 'Ann', lastName: 'Lee' },
    { id: B, displayName: 'bobby' },
    { id: C, firstName: 'Cy', lastName: 'Ng' },
    { id: D, firstName: 'Di', lastName: 'Ro' },
  ],
  teams: [
    {
      id: 1,
      name: 'Aces',
      owners: [A],
      playoffSeed: 1,
      rankCalculatedFinal: 2,
    },
    {
      id: 2,
      name: 'Bees',
      owners: [B],
      playoffSeed: 3,
      rankCalculatedFinal: 3,
    },
    {
      id: 3,
      name: 'Cats',
      owners: [C],
      playoffSeed: 4,
      rankCalculatedFinal: 4,
    },
    {
      id: 4,
      name: 'Dogs',
      owners: [D],
      playoffSeed: 2,
      rankCalculatedFinal: 1,
    },
  ],
  schedule: [
    game(1, 1, 120, 2, 100),
    game(1, 3, 90, 4, 95),
    game(2, 1, 110, 3, 80),
    game(2, 2, 70, 4, 70),
    game(3, 1, 101, 4, 130.5, 'WINNERS_BRACKET'),
    game(3, 2, 99, 3, 88, 'LOSERS_CONSOLATION_LADDER'),
  ],
  ...over,
})

describe('readEspnSeason', () => {
  const read = (wire: WireLeague, past = true) =>
    readEspnSeason(wire, { season: 2024, leagueId: '42', past })!

  it('names the champion from the bracket’s final, not the seeds', () => {
    const s = read(espnSeason())
    expect(s.champion).toBe(4)
    expect(s.runnerUp).toBe(1)
    expect(s.complete).toBe(true)
  })

  it('labels each game from its playoff tier', () => {
    const s = read(espnSeason())
    expect(s.games.map((g) => g.bracket)).toEqual([
      'regular',
      'regular',
      'regular',
      'regular',
      'playoff',
      'consolation',
    ])
    expect(s.games[3].winner).toBeNull()
    expect(s.teams.filter((t) => t.playoffs).map((t) => t.teamId)).toEqual([
      1, 4,
    ])
  })

  it('leaves byes and undecided games out', () => {
    const s = read(
      espnSeason({
        schedule: [
          game(1, 1, 120, 2, 100),
          game(3, 1, 0, null, 0, 'WINNERS_BRACKET'),
        ],
      }),
    )
    expect(s.games).toHaveLength(1)
    // A bye in the bracket is still a playoff appearance.
    expect(s.teams.find((t) => t.teamId === 1)!.playoffs).toBe(true)
  })

  it('lists only the seasons before it, newest first', () => {
    expect(read(espnSeason()).earlier).toEqual([
      { season: 2023, ref: '42' },
      { season: 2022, ref: '42' },
      { season: 2021, ref: '42' },
    ])
  })

  it('names managers by full name, else their display name', () => {
    expect(read(espnSeason()).managers).toMatchObject({
      [A]: 'Ann Lee',
      [B]: 'bobby',
    })
  })

  it('counts co-managers on a team', () => {
    const wire = espnSeason()
    wire.teams![0].owners = [A, '{eeee}']
    expect(read(wire).teams[0].managers).toEqual([A, '{EEEE}'])
  })

  it('keeps the current season open until its last scoring period has passed, however ESPN ranks it', () => {
    const playing = espnSeason({
      status: { latestScoringPeriod: 12, finalScoringPeriod: 17 },
    })
    const s = read(playing, false)
    expect(s.complete).toBe(false)
    expect(s.champion).toBeNull()
    expect(s.teams.every((t) => t.place === null)).toBe(true)
    expect(read(espnSeason(), false).complete).toBe(true)
  })

  it('scores a category league by categories won', () => {
    const s = read(
      espnSeason({
        settings: {
          scoringSettings: { scoringType: 'H2H_MOST_CATEGORIES' },
          scheduleSettings: { matchupPeriodCount: 2, playoffTeamCount: 2 },
        },
        schedule: [game(1, 1, 6, 2, 3)],
      }),
    )
    expect(s.points).toBe(false)
    expect(s.games[0].home.score).toBe(6)
  })

  it('without tiers, a game past the regular season between two playoff seeds is the playoffs', () => {
    const untiered = espnSeason()
    untiered.schedule = untiered.schedule!.map((e) => ({
      ...e,
      playoffTierType: undefined,
    }))
    const s = read(untiered)
    expect(s.games.map((g) => g.bracket).slice(4)).toEqual([
      'playoff',
      'consolation',
    ])
    expect(s.champion).toBe(4)
  })

  it('falls back to ESPN’s first place when there is no final', () => {
    const s = read(espnSeason({ schedule: [game(1, 1, 120, 2, 100)] }))
    expect(s.champion).toBe(4)
    expect(s.runnerUp).toBe(1)
  })

  it('reads nothing from a league without teams', () => {
    expect(
      readEspnSeason({}, { season: 2024, leagueId: '42', past: true }),
    ).toBeNull()
  })
})

const season = (over: Partial<HistorySeason>): HistorySeason => ({
  season: 2024,
  ref: '42',
  name: 'L',
  points: true,
  complete: true,
  teams: [],
  managers: { A: 'Ann', B: 'Bob', C: 'Cy' },
  games: [],
  champion: null,
  runnerUp: null,
  earlier: [],
  ...over,
})

const team = (teamId: number, managers: Array<string>, playoffs = false) => ({
  teamId,
  name: `Team ${teamId}`,
  managers,
  place: null,
  playoffs,
})

const g = (
  period: number,
  home: number,
  hs: number,
  away: number,
  as: number,
  bracket: 'regular' | 'playoff' | 'consolation' = 'regular',
) => ({
  period,
  bracket,
  home: { teamId: home, score: hs },
  away: { teamId: away, score: as },
  winner: hs === as ? null : hs > as ? home : away,
})

describe('summarizeHistory', () => {
  // Team ids are reused: in 2023 team 1 is Bob's, in 2024 Ann's.
  const seasons = [
    season({
      season: 2023,
      managers: { A: 'Ann', B: 'Bobby' },
      teams: [team(1, ['B'], true), team(2, ['A'], true), team(3, ['C'])],
      games: [
        g(1, 1, 100, 2, 90),
        g(2, 2, 80, 3, 80),
        g(3, 2, 150, 1, 60, 'playoff'),
        g(3, 3, 300, 3, 0, 'consolation'),
      ],
      champion: 2,
      runnerUp: 1,
    }),
    season({
      season: 2024,
      teams: [team(1, ['A']), team(2, ['B', 'C'])],
      games: [g(1, 1, 110.5, 2, 110.44)],
      complete: false,
    }),
  ]

  it('names each season’s champion, or none while it’s played', () => {
    const h = summarizeHistory(seasons, ['A'])
    expect(h.seasons).toEqual([2024, 2023])
    expect(h.champions).toEqual([
      {
        season: 2024,
        complete: false,
        champion: null,
        runnerUp: null,
        mine: false,
      },
      {
        season: 2023,
        complete: true,
        champion: { team: 'Team 2', manager: 'Ann' },
        runnerUp: { team: 'Team 1', manager: 'Bob' },
        mine: true,
      },
    ])
  })

  it('follows managers across seasons, not team ids, with their latest names', () => {
    const h = summarizeHistory(seasons, ['A'])
    const ann = h.managers.find((m) => m.id === 'A')!
    expect(ann).toMatchObject({
      name: 'Ann',
      seasons: 2,
      wins: 1,
      losses: 1,
      ties: 1,
      playoffWins: 1,
      playoffLosses: 0,
      playoffs: 1,
      titles: 1,
      mine: true,
    })
    const bob = h.managers.find((m) => m.id === 'B')!
    expect(bob).toMatchObject({ name: 'Bob', wins: 1, losses: 1, finals: 1 })
    // Champions first.
    expect(h.managers[0].id).toBe('A')
  })

  it('gives co-managers each their team’s result', () => {
    const h = summarizeHistory(seasons, [])
    expect(h.managers.find((m) => m.id === 'C')).toMatchObject({
      losses: 1,
      ties: 1,
    })
  })

  it('counts no consolation game', () => {
    const h = summarizeHistory(seasons, [])
    expect(h.records!.highest.score).toBe(150)
  })

  it('keeps the Viewer’s head-to-head against each manager, with their last meeting', () => {
    const h = summarizeHistory(seasons, ['A'])
    expect(h.rivals.map((r) => r.id)).toEqual(['B', 'C'])
    expect(h.rivals[0]).toMatchObject({
      wins: 1,
      losses: 1,
      playoffWins: 1,
      last: { season: 2024, period: 1, mine: 110.5, theirs: 110.44 },
    })
    expect(h.rivals[1]).toMatchObject({ wins: 1, ties: 1 })
    expect(summarizeHistory(seasons, []).rivals).toEqual([])
  })

  it('keeps the league’s scoring records, the closest a decided game', () => {
    const { records } = summarizeHistory(seasons, [])
    expect(records!.highest).toMatchObject({ score: 150, manager: 'Ann' })
    expect(records!.lowest).toMatchObject({
      score: 60,
      manager: 'Bob',
      opponentManager: 'Ann',
      bracket: 'playoff',
    })
    expect(records!.blowout).toMatchObject({ score: 150, opponentScore: 60 })
    expect(records!.closest).toMatchObject({
      season: 2024,
      score: 110.5,
      opponentScore: 110.44,
    })
  })

  it('keeps no scoring records for a category league', () => {
    const h = summarizeHistory(
      [
        season({
          points: false,
          teams: [team(1, ['A']), team(2, ['B'])],
          games: [g(1, 1, 6, 2, 3)],
        }),
      ],
      [],
    )
    expect(h.records).toBeNull()
  })

  it('names a team without a manager by the team', () => {
    const h = summarizeHistory(
      [season({ teams: [team(1, [])], champion: 1 })],
      [],
    )
    expect(h.champions[0].champion).toEqual({
      team: 'Team 1',
      manager: 'Team 1',
    })
  })
})

describe('readSleeperSeason', () => {
  const league: SleeperLeague = {
    league_id: 'L25',
    name: 'Dynasty ',
    season: '2025',
    status: 'complete',
    settings: { playoff_week_start: 3, last_scored_leg: 6 },
    previous_league_id: 'L24',
  }
  const rosters = [1, 2, 3, 4].map((id) => ({
    roster_id: id,
    owner_id: `u${id}`,
    co_owners: id === 4 ? ['u5'] : null,
  }))
  const users = [1, 2, 3, 4, 5].map((id) => ({
    user_id: `u${id}`,
    display_name: `user${id}`,
    metadata: id === 1 ? { team_name: 'Ones' } : null,
  }))
  const m = (
    roster: number,
    matchup: number | null,
    points: number,
  ): SleeperMatchup => ({
    roster_id: roster,
    matchup_id: matchup,
    points,
  })
  const weeks = [
    {
      week: 1,
      matchups: [m(1, 1, 100), m(2, 1, 90), m(3, 2, 80), m(4, 2, 85)],
    },
    { week: 2, matchups: [m(1, 1, 70), m(3, 1, 70), m(2, 2, 0), m(4, 2, 0)] },
    // The final over two weeks (3 and 4); a third-place game in week 4.
    {
      week: 3,
      matchups: [m(1, 1, 100), m(4, 1, 90), m(2, null, 50), m(3, null, 60)],
    },
    {
      week: 4,
      matchups: [m(1, 1, 80), m(4, 1, 100), m(2, 2, 77), m(3, 2, 66)],
    },
    // A week's pairing outside the bracket, and the final's pair meeting
    // again a week after it was decided.
    { week: 5, matchups: [m(2, 3, 50), m(4, 3, 55)] },
    { week: 6, matchups: [m(1, 1, 61), m(4, 1, 62)] },
  ]
  const winners: Array<SleeperBracketGame> = [
    { r: 1, m: 1, t1: 1, t2: 4, w: 4, l: 1, p: 1 },
    { r: 1, m: 2, t1: 2, t2: 3, w: 2, l: 3, p: 3 },
  ]
  const read = (over: Partial<SleeperLeague> = {}) =>
    readSleeperSeason({
      league: { ...league, ...over },
      rosters,
      users,
      weeks,
      winners,
    })!

  it('reads the season’s champion from the bracket’s final', () => {
    const s = read()
    expect(s).toMatchObject({
      season: 2025,
      ref: 'L25',
      name: 'Dynasty',
      complete: true,
      champion: 4,
      runnerUp: 1,
      earlier: [{ season: null, ref: 'L24' }],
    })
    expect(s.teams.map((t) => t.place)).toEqual([2, 3, 4, 1])
  })

  it('sums a two-week round into one game, won as the bracket says', () => {
    const final = read().games.find((x) => x.bracket === 'playoff')!
    expect(final).toMatchObject({
      period: 3,
      home: { teamId: 1, score: 180 },
      away: { teamId: 4, score: 190 },
      winner: 4,
    })
  })

  it('makes a lower place’s game and a pairing outside the bracket consolation', () => {
    const s = read()
    expect(s.games.map((x) => [x.period, x.bracket])).toEqual([
      [1, 'regular'],
      [1, 'regular'],
      [2, 'regular'],
      [3, 'playoff'],
      [4, 'consolation'],
      [5, 'consolation'],
      [6, 'consolation'],
    ])
    // Week 2's 0-0 is unplayed; its 70-70 a tie.
    expect(s.games[2].winner).toBeNull()
  })

  it('names managers and co-managers', () => {
    const s = read()
    expect(s.teams[0].name).toBe('Ones')
    expect(s.teams[3].managers).toEqual(['u4', 'u5'])
    expect(s.managers.u5).toBe('user5')
  })

  it('has no champion, places or playoff teams before the playoffs', () => {
    const s = readSleeperSeason({
      league: { ...league, status: 'in_season' },
      rosters,
      users,
      weeks: weeks.slice(0, 2),
      winners,
    })!
    expect(s.complete).toBe(false)
    expect(s.champion).toBeNull()
    expect(s.teams.some((t) => t.playoffs || t.place)).toBe(false)
  })

  it('links to no earlier season without a previous league', () => {
    expect(read({ previous_league_id: '0' }).earlier).toEqual([])
    expect(read({ previous_league_id: null }).earlier).toEqual([])
  })
})

describe('seasonLeague', () => {
  afterEach(() => vi.unstubAllGlobals())

  const answer = (byUrl: (url: string) => Response) => {
    const urls: Array<string> = []
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url)
      return Promise.resolve(byUrl(url))
    })
    return urls
  }
  const json = (body: unknown) => new Response(JSON.stringify(body))

  it('asks for a season before 2018 at leagueHistory, answered as an array', async () => {
    const urls = answer(() => json([{ seasonId: 2017 }]))
    const wire = await seasonLeague(null, 'football', 2017, '42')
    expect(wire).toEqual({ seasonId: 2017 })
    expect(urls[0]).toContain('/ffl/leagueHistory/42?seasonId=2017&')
    expect(urls[0]).toContain('view=mMatchupScore')
  })

  it('asks for a later season at its league address, and the other if refused', async () => {
    const urls = answer((url) =>
      url.includes('/seasons/')
        ? new Response('', { status: 404 })
        : json([{ seasonId: 2019 }]),
    )
    expect(await seasonLeague(null, 'basketball', 2019, '42')).toEqual({
      seasonId: 2019,
    })
    expect(urls.map((u) => u.split('?')[0])).toEqual([
      'https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/2019/segments/0/leagues/42',
      'https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/leagueHistory/42',
    ])
  })

  it('doesn’t try the other address when ESPN fails', async () => {
    const urls = answer(() => new Response('', { status: 400 }))
    await expect(seasonLeague(null, 'football', 2020, '42')).rejects.toThrow(
      'ESPN 400',
    )
    expect(urls).toHaveLength(1)
  })
})
