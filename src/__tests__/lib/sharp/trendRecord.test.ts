import { describe, expect, it } from 'vitest'
import type { Placement } from '@/lib/sharp/trendRecord'
import {
  creditPlacements,
  resultFor,
  trendStats,
} from '@/lib/sharp/trendRecord'

const pick = (
  id: string,
  createdAt: string,
  o: Partial<{ viewerId: string; side: 'yes' | 'no'; placedAt: string }> = {},
) => ({
  id,
  viewerId: o.viewerId ?? 'u1',
  marketTicker: 'T',
  side: o.side ?? ('yes' as const),
  createdAt,
  placedAt: o.placedAt ?? null,
})
const buy = (at: string, o: Partial<Placement> = {}): Placement => ({
  viewerId: 'u1',
  marketTicker: 'T',
  side: 'yes',
  at,
  via: 'kalshi',
  contracts: 10,
  cost: 5.4,
  ...o,
})

describe('crediting a placement', () => {
  it('goes to the latest suggestion before the purchase', () => {
    const c = creditPlacements(
      [
        pick('a', '2026-10-08T10:00:00Z'),
        pick('b', '2026-10-08T12:00:00Z'),
        pick('c', '2026-10-08T15:00:00Z'),
      ],
      [buy('2026-10-08T13:00:00Z')],
    )
    expect([...c.keys()]).toEqual(['b'])
  })

  it("isn't given for a bet bought before it was suggested", () => {
    expect(
      creditPlacements(
        [pick('a', '2026-10-08T12:00:00Z')],
        [buy('2026-10-08T11:00:00Z')],
      ).size,
    ).toBe(0)
  })

  it('needs the same Viewer, market and side, and a pick not already placed', () => {
    const at = '2026-10-08T13:00:00Z'
    expect(
      creditPlacements(
        [pick('a', '2026-10-08T12:00:00Z', { viewerId: 'u2' })],
        [buy(at)],
      ).size,
    ).toBe(0)
    expect(
      creditPlacements(
        [pick('a', '2026-10-08T12:00:00Z', { side: 'no' })],
        [buy(at)],
      ).size,
    ).toBe(0)
    expect(
      creditPlacements(
        [pick('a', '2026-10-08T12:00:00Z', { placedAt: at })],
        [buy(at)],
      ).size,
    ).toBe(0)
  })

  it('gives two purchases to two suggestions, never one twice', () => {
    const c = creditPlacements(
      [pick('a', '2026-10-08T10:00:00Z'), pick('b', '2026-10-08T12:00:00Z')],
      [buy('2026-10-08T13:00:00Z'), buy('2026-10-08T14:00:00Z')],
    )
    expect(c.size).toBe(2)
  })
})

describe('resultFor', () => {
  it("reads Kalshi's result for the side", () => {
    expect(resultFor('yes', 'yes')).toBe('won')
    expect(resultFor('yes', 'no')).toBe('lost')
    expect(resultFor('', 'yes')).toBeNull()
    expect(resultFor(undefined, 'no')).toBeNull()
  })
})

describe('trendStats', () => {
  it('counts asks, picks, placements and how placed picks did', () => {
    const s = trendStats(
      [{ picks: 3 }, { picks: 0 }, { picks: 1 }],
      [
        { placedAt: 'x', placedVia: 'kalshi', result: 'won', pnl: 4.6 },
        { placedAt: 'x', placedVia: 'agent', result: 'lost', pnl: -5.4 },
        { placedAt: 'x', placedVia: 'kalshi', result: null, pnl: null },
        { placedAt: null, placedVia: null, result: 'won', pnl: null },
      ],
    )
    expect(s).toEqual({
      requests: 3,
      answered: 2,
      picksOffered: 4,
      placed: 3,
      placedVia: { agent: 1, kalshi: 2 },
      won: 1,
      lost: 1,
      void: 0,
      pending: 1,
      winRate: 0.5,
      pnl: -0.8,
      skipped: { won: 1, lost: 0, pending: 0 },
    })
  })
})
