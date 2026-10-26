import { describe, expect, it } from 'vitest'
import type { AvailablePlayer, WireSeasonStat } from '@/lib/fantasy/freeAgents'
import {
  AVAILABLE_LIMIT,
  readEspnAvailable,
  searchAvailable,
  statLine,
} from '@/lib/fantasy/freeAgents'
import { readSleeperAvailable } from '@/lib/fantasy/sleeper/read'

describe('reading ESPN’s Available players', () => {
  const read = readEspnAvailable(
    [
      {
        id: 1,
        onTeamId: 0,
        status: 'FREEAGENT',
        player: {
          id: 1,
          fullName: 'Keegan Murray',
          proTeamId: 23,
          defaultPositionId: 3,
          injuryStatus: 'ACTIVE',
          ownership: { percentOwned: 64.237, percentChange: 3.14 },
        },
      },
      {
        id: 2,
        status: 'WAIVERS',
        player: { fullName: 'Bub Carrington', injuryStatus: 'DAY_TO_DAY' },
      },
      // Rostered after all: left out.
      { id: 3, onTeamId: 4, status: 'ONTEAM', player: { fullName: 'Taken' } },
    ],
    { sport: 'basketball', season: 2027, categories: null },
  )

  it('lists free agents and waiver Players in ESPN’s order', () => {
    expect(read.order).toBe('owned')
    expect(read.players.map((p) => [p.name, p.waivers])).toEqual([
      ['Keegan Murray', false],
      ['Bub Carrington', true],
    ])
    expect(read.players[0]).toMatchObject({
      espnId: 1,
      positionId: 3,
      proTeamId: 23,
      injury: null,
      owned: 64.2,
      ownedChange: 3.1,
    })
    expect(read.players[1]).toMatchObject({
      injury: 'DAY_TO_DAY',
      owned: null,
    })
  })

  it('lists at most the limit', () => {
    const many = readEspnAvailable(
      Array.from({ length: AVAILABLE_LIMIT + 5 }, (_, i) => ({ id: i + 1 })),
      { sport: 'football', season: 2026, categories: null },
    )
    expect(many.players).toHaveLength(AVAILABLE_LIMIT)
  })
})

describe('Available players’ stats', () => {
  const line = (
    split: number,
    stats: Record<string, number>,
    over: Partial<WireSeasonStat> = {},
  ): WireSeasonStat => ({
    id: `0${split}2027`,
    seasonId: 2027,
    statSourceId: 0,
    statSplitTypeId: split,
    stats,
    ...over,
  })

  it('reads a category league’s Categories, per game in basketball', () => {
    const read = readEspnAvailable(
      [
        {
          id: 1,
          player: {
            fullName: 'Keegan Murray',
            stats: [
              line(
                0,
                {},
                { averageStats: { 0: 18.24, 6: 6.1, 13: 7, 14: 15 } },
              ),
              line(2, {}, { averageStats: { 0: 21, 6: 4, 13: 8, 14: 16 } }),
              // Last season's: not this one's.
              line(0, { 0: 99 }, { seasonId: 2026 }),
              // A projection: not what they've done.
              line(0, { 0: 30 }, { statSourceId: 1 }),
            ],
          },
        },
      ],
      {
        sport: 'basketball',
        season: 2027,
        categories: [
          { statId: 19, label: 'FG%', reverse: false },
          { statId: 6, label: 'REB', reverse: false },
          { statId: 0, label: 'PTS', reverse: false },
          { statId: 11, label: 'TO', reverse: true },
        ],
      },
    )
    expect(read.recentLabel).toBe('Last 15')
    expect(read.players[0].stats).toEqual({
      season: [
        { label: 'FG%', value: '.467' },
        { label: 'REB', value: '6.1' },
        { label: 'PTS', value: '18.2' },
      ],
      recent: [
        { label: 'FG%', value: '.500' },
        { label: 'REB', value: '4.0' },
        { label: 'PTS', value: '21.0' },
      ],
    })
  })

  it('gives a baseball pitcher his pitching and a hitter his batting', () => {
    const categories = [
      { statId: 5, label: 'HR', reverse: false },
      { statId: 2, label: 'AVG', reverse: false },
      { statId: 48, label: 'K', reverse: false },
      { statId: 47, label: 'ERA', reverse: true },
    ]
    const read = readEspnAvailable(
      [
        {
          id: 1,
          player: {
            defaultPositionId: 1,
            stats: [line(0, { 34: 90, 45: 10, 48: 33 })],
          },
        },
        {
          id: 2,
          player: {
            defaultPositionId: 7,
            stats: [line(0, { 0: 100, 1: 27, 5: 6 })],
          },
        },
      ],
      { sport: 'baseball', season: 2027, categories },
    )
    expect(read.players.map((p) => p.stats?.season)).toEqual([
      [
        { label: 'K', value: '33' },
        { label: 'ERA', value: '3.00' },
      ],
      [
        { label: 'HR', value: '6' },
        { label: 'AVG', value: '.270' },
      ],
    ])
    expect(read.recentLabel).toBeUndefined()
  })

  it('reads a points league’s Fantasy points and per game', () => {
    expect(
      statLine(
        'football',
        line(0, {}, { appliedTotal: 84.25, appliedAverage: 12.04 }),
        null,
        2,
      ),
    ).toEqual([
      { label: 'FPTS', value: '84.3' },
      { label: 'AVG', value: '12.0' },
    ])
    expect(statLine('football', line(0, {}), null, 2)).toBeNull()
    expect(statLine('football', undefined, null, 2)).toBeNull()
  })
})

describe('reading Sleeper’s Available players', () => {
  it('lists the projected no roster has, most projected first', () => {
    const read = readSleeperAvailable({
      league: { scoring_settings: { rec: 1 } } as never,
      rosters: [
        { roster_id: 1, players: ['10'], reserve: ['11'] },
        { roster_id: 2, players: ['BUF'] },
      ],
      projections: [
        { player_id: '10', player: { first_name: 'On', last_name: 'Team' } },
        { player_id: '11', player: { first_name: 'On', last_name: 'IR' } },
        {
          player_id: '20',
          stats: { pts_ppr: 8.25, pts_std: 6 },
          player: {
            first_name: 'Rashid',
            last_name: 'Shaheed',
            position: 'WR',
            team: 'NO',
            injury_status: 'Questionable',
          },
        },
        {
          player_id: '21',
          stats: { pts_ppr: 12.5 },
          player: { first_name: 'Chase', last_name: 'Brown', position: 'RB' },
        },
        { player_id: 'BUF', player: { last_name: 'Bills', position: 'DEF' } },
        { player_id: 'NE', player: { last_name: 'Patriots', position: 'DEF' } },
      ],
      season: [{ player_id: '21', stats: { pts_ppr: 61.5, gp: 6 } }],
    })
    expect(read.order).toBe('projected')
    expect(read.players.map((p) => [p.name, p.projected])).toEqual([
      ['Chase Brown', 12.5],
      ['Rashid Shaheed', 8.25],
      ['Patriots D/ST', null],
    ])
    expect(read.players[0].stats).toEqual({
      season: [
        { label: 'FPTS', value: '61.5' },
        { label: 'AVG', value: '10.3' },
      ],
      recent: null,
    })
    expect(read.players[1].stats?.season).toBeNull()
    expect(read.players[1]).toMatchObject({
      sourcePlayerId: '20',
      positionId: 3,
      injury: 'QUESTIONABLE',
      waivers: false,
    })
  })
})

describe('searchAvailable', () => {
  const p = (
    name: string,
    positionId: number,
    teamAbbrev: string,
  ): AvailablePlayer => ({
    espnId: name.length,
    name,
    positionId,
    proTeamId: null,
    teamAbbrev,
    injury: null,
    owned: null,
    ownedChange: null,
    waivers: false,
    projected: null,
  })
  const players = [
    p('Luka Dončić', 1, 'LAL'),
    p('Jaren Jackson Jr.', 4, 'MEM'),
    p('Shai Gilgeous-Alexander', 1, 'OKC'),
  ]
  const names = (found: Array<AvailablePlayer>) => found.map((f) => f.name)

  it('matches the start of each word, accents and punctuation aside', () => {
    expect(names(searchAvailable(players, 'luka don'))).toEqual(['Luka Dončić'])
    expect(names(searchAvailable(players, 'jr'))).toEqual(['Jaren Jackson Jr.'])
    expect(names(searchAvailable(players, 'gilgeous'))).toEqual([
      'Shai Gilgeous-Alexander',
    ])
    expect(names(searchAvailable(players, 'uka'))).toEqual([])
  })

  it('matches a Team, and narrows to a position', () => {
    expect(names(searchAvailable(players, 'mem'))).toEqual([
      'Jaren Jackson Jr.',
    ])
    expect(names(searchAvailable(players, '', [1]))).toEqual([
      'Luka Dončić',
      'Shai Gilgeous-Alexander',
    ])
    expect(searchAvailable(players, '  ')).toHaveLength(3)
  })
})
