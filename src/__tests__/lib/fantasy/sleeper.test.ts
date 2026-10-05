import { describe, expect, it } from 'vitest'
import type { WeekData } from '@/lib/fantasy/sleeper/read'
import {
  myRoster,
  proTeamId,
  readSleeperMatchup,
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
    expect(
      myRoster([theirs, { ...mine, owner_id: 'x', co_owners: ['me'] }], 'me')
        ?.roster_id,
    ).toBe(3)
  })
})
