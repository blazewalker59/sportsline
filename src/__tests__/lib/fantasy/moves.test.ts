import { describe, expect, it } from 'vitest'
import type { WireLeague } from '@/lib/fantasy/matchup'
import type { FantasyMove } from '@/lib/fantasy/moves'
import {
  NOT_FOUND_MS,
  STUCK_MS,
  budgetOf,
  checkMove,
  espnReason,
  moveBody,
  moveSummary,
  readMoveReply,
  rosteredBy,
  settleMove,
} from '@/lib/fantasy/moves'

const murray = { espnId: 11, name: 'Keegan Murray' }
const clarkson = { espnId: 22, name: 'Jordan Clarkson' }

describe('moveBody', () => {
  it('sends a claim as a waiver move with its bid, the drop beside it', () => {
    expect(
      moveBody({
        kind: 'claim',
        teamId: 3,
        memberId: '{ABCD}',
        scoringPeriod: 40,
        add: 11,
        drop: 22,
        bid: 7,
      }),
    ).toEqual({
      isLeagueManager: false,
      teamId: 3,
      type: 'WAIVER',
      memberId: '{ABCD}',
      scoringPeriodId: 40,
      executionType: 'EXECUTE',
      bidAmount: 7,
      items: [
        { playerId: 11, type: 'ADD', toTeamId: 3 },
        { playerId: 22, type: 'DROP', fromTeamId: 3 },
      ],
    })
  })

  it('sends an add or a drop as a free-agent move, bidding nothing', () => {
    const drop = moveBody({
      kind: 'drop',
      teamId: 3,
      memberId: '{ABCD}',
      scoringPeriod: 40,
      add: null,
      drop: 22,
      bid: 5,
    })
    expect(drop.type).toBe('FREEAGENT')
    expect(drop.bidAmount).toBe(0)
    expect(drop.items).toEqual([{ playerId: 22, type: 'DROP', fromTeamId: 3 }])
  })
})

describe('readMoveReply', () => {
  it('reads a made add as done and a taken claim as pending', () => {
    expect(readMoveReply('add', 200, { status: 'EXECUTED' }).status).toBe(
      'done',
    )
    expect(readMoveReply('claim', 200, {}).status).toBe('pending')
  })

  it('reads a refusal with ESPN’s reason', () => {
    expect(
      readMoveReply('add', 409, {
        details: [{ message: 'Roster is full.', type: 'ROSTER_LIMIT' }],
      }),
    ).toEqual({ status: 'refused', reason: 'Roster is full.' })
    expect(readMoveReply('add', 400, null).reason).toBe(
      'ESPN refused it (400).',
    )
  })

  it('reads no answer, a timeout or ESPN failing as unknown', () => {
    for (const status of [null, 408, 500, 503])
      expect(readMoveReply('add', status, null).status).toBe('unknown')
  })
})

describe('espnReason', () => {
  it('finds ESPN’s words wherever it puts them', () => {
    expect(espnReason({ messages: ['Player is locked'] })).toBe(
      'Player is locked',
    )
    expect(espnReason({ message: '  ' })).toBeNull()
    expect(espnReason('nope')).toBeNull()
  })
})

const league = {
  teams: [
    { id: 3, roster: { entries: [{ playerId: 22 }] } },
    {
      id: 4,
      roster: { entries: [{ playerPoolEntry: { player: { id: 33 } } }] },
    },
  ],
} as WireLeague

describe('checkMove', () => {
  const rosters = rosteredBy(league)
  const check = (over: Partial<Parameters<typeof checkMove>[0]>) =>
    checkMove({
      kind: 'add',
      add: murray,
      drop: clarkson,
      teamId: 3,
      rosters,
      ...over,
    })

  it('lets a move go when the rosters still allow it', () => {
    expect(check({})).toBeNull()
    expect(check({ kind: 'drop', add: null })).toBeNull()
  })

  it('stops a move the rosters have overtaken', () => {
    expect(check({ add: { espnId: 33, name: 'Taken' } })).toBe(
      'Taken is on another team now.',
    )
    expect(check({ add: { espnId: 22, name: 'Mine' } })).toBe(
      'Mine is already on your team.',
    )
    expect(check({ drop: { espnId: 99, name: 'Gone' } })).toBe(
      'Gone isn’t on your team any more.',
    )
    expect(check({ kind: 'drop', add: null, drop: null })).toBe(
      'Pick a player first.',
    )
  })
})

describe('settleMove', () => {
  const now = new Date('2026-10-25T20:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const move = (
    over: Partial<FantasyMove>,
  ): Pick<FantasyMove, 'kind' | 'add' | 'drop' | 'status' | 'updatedAt'> => ({
    kind: 'add',
    add: murray,
    drop: null,
    status: 'unknown',
    updatedAt: ago(60_000),
    ...over,
  })
  const on = (entries: Record<number, number>) =>
    new Map(Object.entries(entries).map(([p, t]) => [Number(p), t]))

  it('finds an unknown add done once the Player is on the team', () => {
    expect(settleMove(move({}), on({ 11: 3 }), 3, now)).toEqual({
      status: 'done',
      reason: null,
    })
  })

  it('finds a drop done once the Player has left the team', () => {
    expect(
      settleMove(
        move({ kind: 'drop', add: null, drop: clarkson }),
        on({}),
        3,
        now,
      )?.status,
    ).toBe('done')
  })

  it('waits on an unknown add, then gives it up', () => {
    expect(settleMove(move({}), on({}), 3, now)).toBeNull()
    expect(
      settleMove(move({ updatedAt: ago(NOT_FOUND_MS + 1) }), on({}), 3, now),
    ).toEqual({ status: 'refused', reason: 'ESPN has no record of it.' })
    expect(
      settleMove(
        move({ updatedAt: ago(NOT_FOUND_MS + 1) }),
        on({ 11: 4 }),
        3,
        now,
      )?.reason,
    ).toBe('Another team got them first.')
  })

  it('follows a claim until it’s won or lost', () => {
    const claim = move({ kind: 'claim', status: 'pending' })
    expect(settleMove(claim, on({}), 3, now)).toBeNull()
    expect(settleMove(claim, on({ 11: 3 }), 3, now)?.status).toBe('done')
    expect(settleMove(claim, on({ 11: 4 }), 3, now)?.status).toBe('lost')
    // No answer for a claim: it may be waiting all the same.
    expect(
      settleMove({ ...claim, status: 'unknown' }, on({}), 3, now)?.status,
    ).toBe('pending')
  })

  it('takes a move stuck sending as unknown', () => {
    expect(settleMove(move({ status: 'sending' }), on({}), 3, now)).toBeNull()
    expect(
      settleMove(
        move({ status: 'sending', updatedAt: ago(STUCK_MS + 1) }),
        on({}),
        3,
        now,
      ),
    ).toEqual({ status: 'unknown', reason: null })
    expect(settleMove(move({ status: 'done' }), on({}), 3, now)).toBeNull()
  })
})

describe('budgetOf', () => {
  it('reads what the team has left to bid in a budget league', () => {
    expect(
      budgetOf(
        {
          settings: {
            acquisitionSettings: {
              isUsingAcquisitionBudget: true,
              acquisitionBudget: 100,
              minimumBid: 1,
            },
          },
          teams: [
            { id: 3, transactionCounter: { acquisitionBudgetSpent: 37 } },
          ],
        },
        3,
      ),
    ).toEqual({ left: 63, total: 100, minimum: 1 })
    expect(budgetOf({ settings: {} }, 3)).toBeNull()
  })
})

describe('moveSummary', () => {
  it('says the move in words', () => {
    expect(
      moveSummary({ kind: 'claim', add: murray, drop: clarkson, bid: 4 }),
    ).toBe('Claim Keegan Murray ($4), drop Jordan Clarkson')
    expect(
      moveSummary({ kind: 'add', add: murray, drop: null, bid: null }),
    ).toBe('Add Keegan Murray')
    expect(
      moveSummary({ kind: 'drop', add: null, drop: clarkson, bid: null }),
    ).toBe('Drop Jordan Clarkson')
  })
})
