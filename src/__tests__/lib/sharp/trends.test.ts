import { describe, expect, it } from 'vitest'
import type { KalshiOffer } from '@/lib/sharp/engine'
import type { TeamForm } from '@/lib/sharp/form'
import type { TrendGame } from '@/lib/sharp/trends'
import { lineId } from '@/lib/sharp/engine'
import {
  TREND_WEIGHT,
  expectation,
  leagueTotals,
  normalCdf,
  trendChance,
  trendFair,
} from '@/lib/sharp/trends'

const game: TrendGame = {
  gameId: 'g1',
  league: 'nhl',
  home: { id: 'ana', abbreviation: 'ANA' },
  away: { id: 'col', abbreviation: 'COL' },
}
const form = (games: number, avgMargin: number, avgTotal = 6): TeamForm => ({
  games,
  wins: 0,
  losses: 0,
  avgMargin,
  avgTotal,
})

describe('normalCdf', () => {
  it('matches the standard normal', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7)
    expect(normalCdf(1)).toBeCloseTo(0.841345, 5)
    expect(normalCdf(-1.96)).toBeCloseTo(0.024998, 5)
    expect(normalCdf(3) + normalCdf(-3)).toBeCloseTo(1, 7)
  })
})

describe('expectation', () => {
  it('shrinks a short run of form toward average, and adds home ice', () => {
    // COL +2 a game over 6 (counts half: +1); ANA even, at home (+0.15).
    const e = expectation(
      game,
      new Map([
        ['col', form(6, 2, 7)],
        ['ana', form(6, 0, 5)],
      ]),
      6,
    )!
    expect(e.margin).toBeCloseTo(-1 + 0.15)
    // Totals shrink halfway to 6 too: 6.5 and 5.5, averaging 6.
    expect(e.total).toBeCloseTo(6)
  })

  it("won't read a trend from fewer than 3 games a team", () => {
    expect(
      expectation(
        game,
        new Map([
          ['col', form(2, 3)],
          ['ana', form(6, 0)],
        ]),
      ),
    ).toBeNull()
  })
})

describe('trendChance', () => {
  const e = { margin: -0.85, total: 6.2 }

  it('splits a winner market between the two teams', () => {
    const col = trendChance(
      { gameId: 'g1', kind: 'moneyline', teamId: 'col', line: null },
      game,
      e,
    )
    const ana = trendChance(
      { gameId: 'g1', kind: 'moneyline', teamId: 'ana', line: null },
      game,
      e,
    )
    expect(col).toBeGreaterThan(0.6)
    expect(col + ana).toBeCloseTo(1)
  })

  it('makes a bigger spread less likely, and an over likelier below the expected total', () => {
    const by = (line: number) =>
      trendChance(
        { gameId: 'g1', kind: 'spread', teamId: 'col', line },
        game,
        e,
      )
    expect(by(1.5)).toBeLessThan(by(0.5))
    const over = (line: number) =>
      trendChance({ gameId: 'g1', kind: 'total', teamId: null, line }, game, e)
    expect(over(5.5)).toBeGreaterThan(0.5)
    expect(over(6.5)).toBeLessThan(0.5)
  })
})

describe('trendFair', () => {
  const offer = (
    side: 'yes' | 'no',
    price: number,
    bid: number,
  ): KalshiOffer => ({
    ticker: 'KXNHLGAME-26OCT08COLANA-COL',
    key: { gameId: 'g1', kind: 'moneyline', teamId: 'col', line: null },
    league: 'nhl',
    startsAt: '2026-10-09T02:00:00Z',
    side,
    price,
    bid,
    volume: 100,
    title: 'COL win',
    gameLabel: 'COL @ ANA',
  })

  it("blends the trend with Kalshi's own price, from the YES book", () => {
    const forms = new Map([
      ['col', form(6, 2)],
      ['ana', form(6, 0)],
    ])
    const { fair, model } = trendFair(
      [offer('yes', 0.56, 0.54), offer('no', 0.46, 0.44)],
      new Map([['g1', game]]),
      forms,
    )
    const id = lineId(offer('yes', 0, 0).key)
    const p = model.get(id)!
    expect(fair.get(id)!.prob).toBeCloseTo(
      TREND_WEIGHT * p + (1 - TREND_WEIGHT) * 0.55,
    )
    expect(fair.get(id)!.sources).toEqual([])
  })

  it('prices nothing without a readable trend', () => {
    const { fair } = trendFair(
      [offer('yes', 0.56, 0.54)],
      new Map([['g1', game]]),
      new Map([['col', form(1, 2)]]),
    )
    expect(fair.size).toBe(0)
  })
})

describe('leagueTotals', () => {
  it('averages each league with enough finals', () => {
    const t = leagueTotals([
      ...Array.from({ length: 10 }, () => ({
        league: 'nhl' as const,
        total: 6,
      })),
      { league: 'nba', total: 220 },
    ])
    expect(t.get('nhl')).toBe(6)
    expect(t.has('nba')).toBe(false)
  })
})
