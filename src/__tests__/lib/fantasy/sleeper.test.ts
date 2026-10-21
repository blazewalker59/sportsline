import { describe, expect, it } from 'vitest'
import type { WeekData } from '@/lib/fantasy/sleeper/read'
import {
  myRoster,
  proTeamId,
  readSleeperActivity,
  readSleeperMatchup,
  readSleeperStandings,
  readSleeperWhatIfWeek,
} from '@/lib/fantasy/sleeper/read'

const data: WeekData = {
  info: new Map([
    [
      '4046',
      {
        first_name: 'Patrick',
        last_name: 'Mahomes',
        position: 'QB',
        team: 'KC',
      },
    ],
    [
      '6794',
      {
        first_name: 'Justin',
        last_name: 'Jefferson',
        position: 'WR',
        team: 'MIN',
        injury_status: 'Out',
      },
    ],
    [
      '9000',
      {
        first_name: 'Terry',
        last_name: 'McLaurin',
        position: 'WR',
        team: 'WAS',
      },
    ],
    [
      'DET',
      {
        first_name: 'Detroit',
        last_name: 'Lions',
        position: 'DEF',
        team: 'DET',
      },
    ],
  ]),
  stats: new Map([
    ['4046', { pass_yd: 225, pass_td: 2, pass_int: 1, pts_ppr: 17 }],
  ]),
  projections: new Map([
    ['4046', { pts_ppr: 21.3, pts_half_ppr: 21.3, pts_std: 21.3 }],
  ]),
}
const league = {
  league_id: 'L1',
  name: 'Dynasty',
  roster_positions: ['QB', 'WR', 'SUPER_FLEX', 'DEF', 'BN', 'IR'],
  scoring_settings: { pass_yd: 0.04, pass_td: 4, pass_int: -2, rec: 1 },
}
const mine = {
  roster_id: 3,
  owner_id: 'me',
  starters: ['4046', '0', '9000', 'DET'],
  players: ['4046', '9000', 'DET', '6794'],
  reserve: ['6794'],
  settings: { wins: 3, losses: 1 },
}
const theirs = {
  roster_id: 7,
  owner_id: 'them',
  starters: [],
  players: [],
  settings: { wins: 1, losses: 3 },
}

describe('reading a Sleeper Matchup', () => {
  const view = readSleeperMatchup({
    league,
    rosters: [mine, theirs],
    users: [
      {
        user_id: 'me',
        display_name: 'blaze',
        metadata: { team_name: 'Subs on Subs' },
      },
      { user_id: 'them', display_name: 'rival', avatar: 'abc' },
    ],
    matchups: [
      {
        roster_id: 3,
        matchup_id: 2,
        points: 88.4,
        starters: mine.starters,
        players: mine.players,
        players_points: { '4046': 17 },
      },
      { roster_id: 7, matchup_id: 2, points: 70.1 },
    ],
    week: 4,
    mine,
    data,
  })

  it('finds both sides with their names, records and live points', () => {
    expect(view.mine).toMatchObject({
      name: 'Subs on Subs',
      abbrev: 'SOS',
      record: '3-1',
      score: 88.4,
    })
    expect(view.opponent).toMatchObject({
      name: 'rival',
      score: 70.1,
      logo: 'https://sleepercdn.com/avatars/thumbs/abc',
    })
    expect(view.scoringType).toBe('H2H_POINTS')
  })

  it('maps Sleeper slots to ESPN’s, skipping empty ones, then bench and reserve', () => {
    expect(view.mine.lineup.map((p) => [p.name, p.slot, p.starter])).toEqual([
      ['Patrick Mahomes', 'QB', true],
      ['Terry McLaurin', 'OP', true],
      ['Lions D/ST', 'D/ST', true],
      ['Justin Jefferson', 'IR', false],
    ])
  })

  it('scores the breakdown by the league’s settings, keeps Sleeper’s points', () => {
    const qb = view.mine.lineup[0]
    expect(qb).toMatchObject({
      points: 17,
      projected: 21.3,
      proTeamId: 12,
      positionId: 1,
      sourcePlayerId: '4046',
    })
    expect(qb.breakdown.map((b) => [b.label, b.value, b.points])).toEqual([
      ['Pass yds', 225, 9],
      ['Pass TD', 2, 8],
      ['Interceptions thrown', 1, -2],
    ])
    // No line yet: no points (not zero).
    expect(view.mine.lineup[1].points).toBeNull()
  })

  it('reads injuries, defenses and Sleeper’s team abbreviations', () => {
    expect(view.mine.lineup[3].injury).toBe('OUT')
    expect(view.mine.lineup[2]).toMatchObject({
      espnId: -8,
      proTeamId: 8,
      positionId: 16,
    })
    expect(proTeamId('WAS')).toBe(28)
    expect(proTeamId('BUF')).toBe(2)
    expect(proTeamId('LAR')).toBe(14)
    expect(
      myRoster([theirs, { ...mine, owner_id: 'x', co_owners: ['me'] }], 'me')
        ?.roster_id,
    ).toBe(3)
  })
})

describe('reading a Sleeper league’s Standings', () => {
  const users = [
    {
      user_id: 'me',
      display_name: 'me',
      metadata: { team_name: 'Bronx Bombers' },
    },
    { user_id: 'them', display_name: 'rival' },
  ]
  const rosters = [
    {
      ...theirs,
      settings: { wins: 3, losses: 1, fpts: 480, fpts_decimal: 25 },
      metadata: { streak: '2W' },
    },
    {
      ...mine,
      settings: {
        wins: 3,
        losses: 1,
        fpts: 512,
        fpts_decimal: 4,
        fpts_against: 430,
        fpts_against_decimal: 50,
      },
      metadata: { streak: '1L' },
    },
  ]

  it('ranks by record, then points for, the Viewer’s team marked', () => {
    const s = readSleeperStandings({
      league: { ...league, settings: { playoff_teams: 6 } },
      rosters,
      users,
      mine: 3,
    })!
    expect(s.playoffTeams).toBe(6)
    expect(s.rows[0]).toMatchObject({
      teamId: 3,
      rank: 1,
      name: 'Bronx Bombers',
      pointsFor: 512.04,
      pointsAgainst: 430.5,
      streak: 'L1',
      mine: true,
    })
    expect(s.rows[1]).toMatchObject({
      teamId: 7,
      rank: 2,
      name: 'rival',
      pointsFor: 480.25,
      pointsAgainst: null,
      streak: 'W2',
      mine: false,
    })
  })

  it('has none without rosters', () => {
    expect(
      readSleeperStandings({ league, rosters: [], users, mine: null }),
    ).toBeNull()
  })
})

describe('reading a Sleeper league’s Activity', () => {
  const users = [
    {
      user_id: 'me',
      display_name: 'me',
      metadata: { team_name: 'Bronx Bombers' },
    },
    { user_id: 'them', display_name: 'rival' },
  ]
  const activity = readSleeperActivity({
    rosters: [mine, theirs],
    users,
    info: data.info,
    transactions: [
      {
        transaction_id: 'fa',
        type: 'free_agent',
        status: 'complete',
        status_updated: Date.parse('2026-10-18T15:00:00Z'),
        adds: { '9000': 3 },
        drops: { '6794': 3 },
        roster_ids: [3],
      },
      {
        transaction_id: 'claim',
        type: 'waiver',
        status: 'complete',
        status_updated: Date.parse('2026-10-19T09:00:00Z'),
        adds: { '4046': 7 },
        roster_ids: [7],
        settings: { waiver_bid: 31 },
      },
      {
        transaction_id: 'deal',
        type: 'trade',
        status: 'complete',
        status_updated: Date.parse('2026-10-20T01:00:00Z'),
        adds: { '4046': 3, DET: 7 },
        drops: { '4046': 7, DET: 3 },
        roster_ids: [7, 3],
      },
      // A claim that lost: not a move.
      {
        transaction_id: 'lost',
        type: 'waiver',
        status: 'failed',
        adds: { '9000': 7 },
        roster_ids: [7],
      },
    ],
  })

  it('gives a contested claim every team’s claim, the winner’s among them', () => {
    expect(activity.entries.find((e) => e.id === 'fa')?.claims).toBeUndefined()
    const contested = readSleeperActivity({
      rosters: [mine, theirs],
      users,
      info: data.info,
      transactions: [
        {
          transaction_id: 'won',
          type: 'waiver',
          status: 'complete',
          leg: 6,
          adds: { '9000': 7 },
          roster_ids: [7],
          settings: { waiver_bid: 12 },
        },
        {
          transaction_id: 'lost',
          type: 'waiver',
          status: 'failed',
          leg: 6,
          adds: { '9000': 3 },
          roster_ids: [3],
          settings: { waiver_bid: 20 },
        },
      ],
    })
    expect(contested.entries.map((e) => e.id)).toEqual(['won'])
    expect(contested.entries[0].claims).toEqual([
      { teamId: 3, bid: 20, won: false },
      { teamId: 7, bid: 12, won: true },
    ])
  })

  it('names each roster’s team', () => {
    expect(activity.teams).toEqual([
      { teamId: 3, name: 'Bronx Bombers', abbrev: 'BB' },
      { teamId: 7, name: 'rival', abbrev: 'RIVA' },
    ])
  })

  it('reads completed moves newest first', () => {
    expect(activity.entries.map((e) => [e.id, e.kind, e.teamIds])).toEqual([
      ['deal', 'trade', [3, 7]],
      ['claim', 'waiver', [7]],
      ['fa', 'add_drop', [3]],
    ])
    expect(activity.entries[1].bid).toBe(31)
  })

  it('names Players the way a Lineup does, defenses included', () => {
    const fa = activity.entries.find((e) => e.id === 'fa')!
    expect(
      fa.items.map((i) => [i.action, i.player.name, i.player.sourcePlayerId]),
    ).toEqual([
      ['add', 'Terry McLaurin', '9000'],
      ['drop', 'Justin Jefferson', '6794'],
    ])
    const deal = activity.entries.find((e) => e.id === 'deal')!
    expect(
      deal.items.map((i) => [i.player.name, i.fromTeamId, i.toTeamId]),
    ).toEqual([
      ['Patrick Mahomes', 7, 3],
      ['Lions D/ST', 3, 7],
    ])
  })
})

describe('reading a Sleeper week for What-if standings', () => {
  const week = readSleeperWhatIfWeek({
    league,
    rosters: [{ ...mine, taxi: ['7777'] }, theirs],
    users: [],
    info: data.info,
    week: 3,
    matchups: [
      {
        roster_id: 3,
        matchup_id: 1,
        points: 40,
        starters: ['4046', '0', '9000', 'DET'],
        players: ['4046', '9000', 'DET', '6794', '7777'],
        players_points: {
          '4046': 20,
          '9000': 10,
          DET: 10,
          '6794': 30,
          '7777': 50,
        },
      },
      { roster_id: 7, matchup_id: 1, points: 55, starters: [], players: [] },
    ],
  })!

  it('reads the league’s starting slots and each roster, eligible by position', () => {
    expect(week.slots).toEqual(['QB', 'WR', 'SUPER_FLEX', 'DEF'])
    const home = week.matchups[0].home
    expect(home.total).toBe(40)
    expect(home.roster.map((r) => [r.id, r.slot, r.starter])).toEqual([
      ['4046', 'QB', true],
      // The empty slot ('0') is no one.
      ['9000', 'SUPER_FLEX', true],
      ['DET', 'DEF', true],
      // The taxi squad couldn't have started.
      ['6794', 'BN', false],
    ])
    expect(home.roster.find((r) => r.id === '6794')?.eligible).toContain('WR')
  })
})
