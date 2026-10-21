import { describe, expect, it } from 'vitest'
import type { ActivityPlayer, WireTopic } from '@/lib/fantasy/activity'
import {
  ACTIVITY_LIMIT,
  attachClaims,
  espnActivityPlayerIds,
  espnClaims,
  kindOf,
  readEspnActivity,
} from '@/lib/fantasy/activity'

const playerOf = (espnId: number): ActivityPlayer => ({
  espnId,
  name: `Player ${espnId}`,
  positionId: null,
  proTeamId: null,
})

const at = (iso: string) => Date.parse(iso)

const topics: Array<WireTopic> = [
  {
    id: 'fa',
    date: at('2026-10-18T15:00:00Z'),
    messages: [
      { messageTypeId: 178, targetId: 1, to: 3 },
      { messageTypeId: 179, targetId: 2, to: 3 },
    ],
  },
  {
    id: 'waiver',
    date: at('2026-10-19T09:00:00Z'),
    messages: [{ messageTypeId: 180, targetId: 4, to: 5, from: 12 }],
  },
  {
    id: 'cut',
    date: at('2026-10-17T12:00:00Z'),
    messages: [{ messageTypeId: 239, targetId: 6, for: 7, to: -1 }],
  },
  {
    id: 'trade',
    date: at('2026-10-20T01:00:00Z'),
    messages: [
      { messageTypeId: 244, targetId: 8, from: 9, to: 3 },
      { messageTypeId: 244, targetId: 10, from: 3, to: 9 },
    ],
  },
  // Nothing usable.
  { id: 'empty', date: at('2026-10-20T02:00:00Z'), messages: [] },
]

describe('readEspnActivity', () => {
  const entries = readEspnActivity(topics, playerOf)

  it('reads each topic as one move, newest first', () => {
    expect(entries.map((e) => [e.id, e.kind])).toEqual([
      ['trade', 'trade'],
      ['waiver', 'waiver'],
      ['fa', 'add_drop'],
      ['cut', 'drop'],
    ])
  })

  it('keeps an add bundled with its drop together, by the team that moved', () => {
    const fa = entries.find((e) => e.id === 'fa')!
    expect(fa.teamIds).toEqual([3])
    expect(fa.items).toEqual([
      { action: 'add', player: playerOf(1), fromTeamId: null, toTeamId: 3 },
      { action: 'drop', player: playerOf(2), fromTeamId: 3, toTeamId: null },
    ])
    expect(fa.at).toBe('2026-10-18T15:00:00.000Z')
  })

  it('reads a waiver claim’s bid, and a type-239 drop’s team', () => {
    expect(entries.find((e) => e.id === 'waiver')).toMatchObject({
      bid: 12,
      teamIds: [5],
    })
    expect(entries.find((e) => e.id === 'cut')).toMatchObject({
      teamIds: [7],
      bid: null,
    })
  })

  it('says where each Player in a trade went', () => {
    const trade = entries.find((e) => e.id === 'trade')!
    expect(trade.teamIds).toEqual([3, 9])
    expect(
      trade.items.map((i) => [i.player.espnId, i.fromTeamId, i.toTeamId]),
    ).toEqual([
      [8, 9, 3],
      [10, 3, 9],
    ])
  })

  it('keeps the newest moves only', () => {
    const many: Array<WireTopic> = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      date: i * 1000,
      messages: [{ messageTypeId: 178, targetId: i, to: 1 }],
    }))
    const read = readEspnActivity(many, playerOf)
    expect(read).toHaveLength(ACTIVITY_LIMIT)
    expect(read[0].id).toBe('79')
  })
})

describe('espnActivityPlayerIds', () => {
  it('names every Player once', () => {
    expect(espnActivityPlayerIds(topics).sort((a, b) => a - b)).toEqual([
      1, 2, 4, 6, 8, 10,
    ])
  })
})

describe('kindOf', () => {
  const add = {
    action: 'add' as const,
    player: playerOf(1),
    fromTeamId: null,
    toTeamId: 1,
  }
  const drop = { ...add, action: 'drop' as const }
  it('tells adds, drops and both apart', () => {
    expect(kindOf([add], false)).toBe('add')
    expect(kindOf([drop], false)).toBe('drop')
    expect(kindOf([add, drop], false)).toBe('add_drop')
    expect(kindOf([add, drop], true)).toBe('waiver')
  })
})

describe('waiver claims', () => {
  const waivers = [
    {
      status: 'FAILED_INVALIDPLAYERSOURCE',
      scoringPeriodId: 6,
      bidAmount: 20,
      teamId: 2,
      items: [{ playerId: 4, type: 'ADD' }],
    },
    {
      status: 'EXECUTED',
      scoringPeriodId: 6,
      bidAmount: 12,
      teamId: 5,
      items: [
        { playerId: 4, type: 'ADD' },
        { playerId: 9, type: 'DROP' },
      ],
    },
    {
      status: 'FAILED_LOWBID',
      scoringPeriodId: 6,
      bidAmount: 7,
      teamId: 8,
      items: [{ playerId: 4, type: 'ADD' }],
    },
    // Alone in its run: nothing to compare.
    {
      status: 'EXECUTED',
      scoringPeriodId: 6,
      bidAmount: 1,
      teamId: 3,
      items: [{ playerId: 50, type: 'ADD' }],
    },
  ]

  it('groups each run’s claims on a Player, highest bid first', () => {
    expect(espnClaims(waivers).get(4)).toEqual([
      [
        { teamId: 2, bid: 20, won: false },
        { teamId: 5, bid: 12, won: true },
        { teamId: 8, bid: 7, won: false },
      ],
    ])
  })

  it('gives a contested claim its competing claims, not an uncontested one', () => {
    const entries = readEspnActivity(
      [
        {
          id: 'w',
          date: 2,
          messages: [{ messageTypeId: 180, targetId: 4, to: 5, from: 12 }],
        },
        {
          id: 'solo',
          date: 1,
          messages: [{ messageTypeId: 180, targetId: 50, to: 3, from: 1 }],
        },
      ],
      playerOf,
    )
    attachClaims(entries, espnClaims(waivers))
    expect(
      entries.find((e) => e.id === 'w')?.claims?.map((c) => c.teamId),
    ).toEqual([2, 5, 8])
    expect(entries.find((e) => e.id === 'solo')?.claims).toBeUndefined()
  })
})
