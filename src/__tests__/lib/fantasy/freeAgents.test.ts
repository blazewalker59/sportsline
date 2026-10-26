import { describe, expect, it } from 'vitest'
import type { AvailablePlayer } from '@/lib/fantasy/freeAgents'
import {
  AVAILABLE_LIMIT,
  readEspnAvailable,
  searchAvailable,
} from '@/lib/fantasy/freeAgents'
import { readSleeperAvailable } from '@/lib/fantasy/sleeper/read'

describe('reading ESPN’s Available players', () => {
  const read = readEspnAvailable([
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
  ])

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
    )
    expect(many.players).toHaveLength(AVAILABLE_LIMIT)
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
    })
    expect(read.order).toBe('projected')
    expect(read.players.map((p) => [p.name, p.projected])).toEqual([
      ['Chase Brown', 12.5],
      ['Rashid Shaheed', 8.25],
      ['Patriots D/ST', null],
    ])
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
