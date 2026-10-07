import { describe, expect, it } from 'vitest'
import type { Candidate, KalshiOffer, LineKey } from '@/lib/sharp/engine'
import {
  DEFAULT_RULES,
  candidates,
  devig,
  fairPrices,
  impliedFromAmerican,
  kalshiFee,
  profitPerContract,
  selectCombo,
  selectPicks,
} from '@/lib/sharp/engine'

const now = Date.parse('2026-10-05T14:00:00Z')
const later = '2026-10-05T23:00:00Z'
const key = (gameId: string, kind: LineKey['kind'] = 'moneyline'): LineKey => ({
  gameId,
  kind,
  teamId: kind === 'total' ? null : 'home',
  line: kind === 'moneyline' ? null : 7.5,
})

describe('prices', () => {
  it('reads American odds and takes out the vig', () => {
    expect(impliedFromAmerican(-150)).toBeCloseTo(0.6)
    expect(impliedFromAmerican(130)).toBeCloseTo(0.4348, 3)
    const [a, b] = devig(impliedFromAmerican(-110), impliedFromAmerican(-110))
    expect(a).toBeCloseTo(0.5)
    expect(a + b).toBeCloseTo(1)
  })

  it('charges Kalshi’s fee, most at even money', () => {
    expect(kalshiFee(0.5)).toBe(0.02)
    expect(kalshiFee(0.9)).toBe(0.01)
    expect(kalshiFee(0.05)).toBe(0.01)
  })

  it('weights sharp sources more in the fair price', () => {
    const fair = fairPrices([
      { key: key('g1'), source: 'pinnacle', prob: 0.6 },
      { key: key('g1'), source: 'draftkings', prob: 0.52 },
    ])
    expect(fair.get('g1|moneyline|home|')!.prob).toBeCloseTo(0.58)
  })
})

describe('finding edges', () => {
  const offer = (over: Partial<KalshiOffer>): KalshiOffer => ({
    ticker: 'T',
    key: key('g1'),
    league: 'nfl',
    startsAt: later,
    side: 'yes',
    price: 0.5,
    bid: 0.49,
    volume: 100,
    title: 'Home win',
    gameLabel: 'A @ H',
    ...over,
  })
  const fair = fairPrices([
    { key: key('g1'), source: 'pinnacle', prob: 0.56 },
    { key: key('g2'), source: 'draftkings', prob: 0.7 },
  ])
  const rules = { ...DEFAULT_RULES, now }

  it('prices both sides and keeps the edge after the fee', () => {
    const [c] = candidates([offer({})], fair, rules)
    // 56% fair, 50¢ + 2¢ fee: 4 points.
    expect(c.edge).toBeCloseTo(0.04)
    expect(c.evPerDollar).toBeCloseTo(0.04 / 0.52)
    // Backing NO at 45¢: fair 44%, no edge.
    expect(
      candidates([offer({ side: 'no', price: 0.45 })], fair, rules),
    ).toEqual([])
  })

  it('needs a sharp source, a tight book, time before the start and a sane price', () => {
    expect(
      candidates([offer({ key: key('g2'), price: 0.6 })], fair, rules),
    ).toEqual([])
    expect(candidates([offer({ bid: 0.3 })], fair, rules)).toEqual([])
    expect(
      candidates([offer({ startsAt: '2026-10-05T14:10:00Z' })], fair, rules),
    ).toEqual([])
    expect(
      candidates([offer({ price: 0.05, bid: 0.04 })], fair, rules),
    ).toEqual([])
    // Near-locks are out too: 85¢ risks a lot to win a little.
    expect(
      candidates(
        [offer({ price: 0.85, bid: 0.84 })],
        fairPrices([{ key: key('g1'), source: 'pinnacle', prob: 0.95 }]),
        rules,
      ),
    ).toEqual([])
  })

  it('takes spreads and totals on the main line only', () => {
    const at = (line: number): LineKey => ({ ...key('g1', 'spread'), line })
    const ladder = fairPrices([
      { key: at(1.5), source: 'polymarket', prob: 0.68 },
      { key: at(3.5), source: 'pinnacle', prob: 0.52 },
      { key: at(6.5), source: 'polymarket', prob: 0.38 },
    ])
    const offers = [1.5, 3.5, 6.5].map((line) =>
      offer({ ticker: `S${line}`, key: at(line), price: 0.3, bid: 0.29 }),
    )
    // Every rung looks underpriced; only the one near even money counts.
    expect(candidates(offers, ladder, rules).map((c) => c.ticker)).toEqual([
      'S3.5',
    ])
  })

  it('leaves out an edge recent form argues against', () => {
    const against = { lean: -0.4, note: 'cold' }
    const backs = { lean: 0.4, note: 'hot' }
    expect(candidates([offer({})], fair, rules, () => against)).toEqual([])
    const [c] = candidates([offer({})], fair, rules, () => backs)
    expect(c.form).toEqual(backs)
  })
})

const cand = (
  id: string,
  league: Candidate['league'],
  kind: LineKey['kind'],
  ev: number,
  fair = 0.55,
): Candidate =>
  ({
    ticker: id,
    key: key(id.split(':')[0], kind),
    league,
    startsAt: later,
    side: 'yes',
    price: fair - 0.05,
    bid: null,
    volume: 0,
    title: id,
    gameLabel: id,
    fair,
    fee: 0.02,
    edge: ev / 10,
    evPerDollar: ev,
    grade: 'edge',
    sources: [],
    form: null,
  }) as Candidate

describe('choosing the slate', () => {
  it('mixes Leagues and markets, one pick a Game', () => {
    const pool = [
      cand('g1:a', 'nfl', 'spread', 0.3),
      cand('g1:b', 'nfl', 'total', 0.29),
      cand('g2', 'nfl', 'spread', 0.28),
      cand('g3', 'nfl', 'moneyline', 0.27),
      cand('g4', 'mlb', 'spread', 0.2),
      cand('g5', 'nba', 'total', 0.15),
      cand('g6', 'nhl', 'moneyline', 0.1),
    ]
    const picks = selectPicks(pool).map((p) => p.ticker)
    // Two NFL and two spreads fill those caps; the fifth relaxes the
    // market mix (never one-per-Game), so MLB's spread joins.
    expect(picks).toEqual(['g1:a', 'g2', 'g5', 'g6', 'g4'])
  })

  it('lets form decide between close edges', () => {
    const cold = { ...cand('g1', 'nfl', 'spread', 0.05), form: null }
    const hot = {
      ...cand('g2', 'nba', 'total', 0.04),
      form: { lean: 0.8, note: 'hot' },
    }
    expect(selectPicks([cold, hot], 1).map((p) => p.ticker)).toEqual(['g2'])
  })

  it('builds the combo from likely legs in different Games', () => {
    const combo = selectCombo([
      cand('g1:a', 'nfl', 'spread', 0.3, 0.6),
      cand('g1:b', 'nfl', 'total', 0.29, 0.6),
      cand('g2', 'mlb', 'moneyline', 0.2, 0.55),
      cand('g3', 'nba', 'total', 0.1, 0.3),
    ])!
    expect(combo.legs.map((l) => l.ticker)).toEqual(['g1:a', 'g2'])
    expect(combo.fair).toBeCloseTo(0.6 * 0.55)
    expect(combo.impliedPrice).toBeCloseTo(0.55 * 0.5)
  })

  it('counts a settled pick’s profit per contract, fee in', () => {
    expect(profitPerContract(0.5, 'won')).toBeCloseTo(0.48)
    expect(profitPerContract(0.5, 'lost')).toBeCloseTo(-0.52)
  })
})
