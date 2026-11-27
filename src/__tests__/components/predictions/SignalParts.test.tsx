import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PredictionView } from '@/lib/kalshi/predictionViews'
import {
  LegDots,
  OddsMeter,
  arrowOf,
  legGlyph,
  toneOf,
} from '@/components/predictions/PredictionParts'
import { dayChange } from '@/components/predictions/PredictionPortfolio'
import { StatTile } from '@/components/layout/StatTile'

const prediction = (over: Partial<PredictionView>): PredictionView => ({
  id: 'p1',
  kind: 'single',
  side: 'yes',
  title: 'Chiefs to win',
  contracts: 100,
  cost: 52,
  status: 'open',
  result: null,
  payout: null,
  pnl: null,
  openedAt: '2026-11-26T00:00:00Z',
  settledAt: null,
  chance: 0.62,
  entryChance: 0.52,
  value: 61,
  history: [],
  legs: [],
  ...over,
})

describe('Signal parts for Predictions', () => {
  it('tones money positive or negative, never the live orange', () => {
    expect(toneOf(3.4)).toBe('text-positive')
    expect(toneOf(-1.1)).toBe('text-negative')
    expect(toneOf(0)).toBe('text-muted')
    expect(arrowOf(3.4)).toBe('▲')
    expect(arrowOf(-1.1)).toBe('▼')
  })

  it('draws Legs as glyphs: ● won, ◐ to play, ○ lost', () => {
    expect([legGlyph('won'), legGlyph('pending'), legGlyph('lost')]).toEqual([
      '●',
      '◐',
      '○',
    ])
    const html = renderToStaticMarkup(
      <LegDots
        legs={(['won', 'pending', 'lost'] as const).map((status) => ({
          title: 'Leg',
          side: 'yes',
          chance: 0.5,
          status,
          game: null,
          playerId: null,
          playerName: null,
          teamId: null,
          progress: null,
        }))}
      />,
    )
    expect(html).toContain('●')
    expect(html).toContain('◐')
    expect(html).toContain('○')
  })

  it('moves the portfolio over the day by the Odds history, a contract paying $1', () => {
    expect(
      dayChange([
        prediction({ history: [{ at: '2026-11-26T00:00', chance: 0.5 }] }),
        prediction({
          contracts: 50,
          chance: 0.2,
          history: [{ at: '2026-11-26T00:00', chance: 0.3 }],
        }),
      ]),
    ).toBeCloseTo(100 * 0.12 - 50 * 0.1)
    expect(dayChange([prediction({})])).toBeNull()
  })

  it('reads the Odds on a meter with the manual’s label row', () => {
    const html = renderToStaticMarkup(<OddsMeter prediction={prediction({})} />)
    expect(html).toContain('role="meter"')
    expect(html).toContain('aria-valuenow="62"')
    expect(html).toContain('Odds 62%')
    expect(html).toContain('Got in at 52%')
    expect(html).toContain('Cash out $61.00')
  })

  it('sets a stat in heavy Inter, never dots, over its label', () => {
    const html = renderToStaticMarkup(
      <StatTile label="Win rate" value="57%" sub="4–3" />,
    )
    expect(html).toContain('font-extrabold')
    expect(html).not.toContain('font-dots')
    expect(html).toContain('57%')
    expect(html).toMatch(/uppercase[^>]*>Win rate/)
  })
})
