import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LegView, PredictionView } from '@/lib/kalshi/server'
import { LegDots, MAX_LEG_DOTS } from '@/components/predictions/PredictionParts'
import { PredictionCard } from '@/components/predictions/PredictionCard'

const leg = (i: number): LegView => ({
  title: `Leg ${i}`,
  side: 'yes',
  chance: 0.5,
  status: i < 3 ? 'won' : 'pending',
  game: null,
  playerId: null,
  playerName: null,
  teamId: null,
  progress: null,
})

const combo = (n: number): PredictionView => ({
  id: 'combo-1',
  kind: 'combo',
  side: 'yes',
  title: `${n}-leg combo`,
  contracts: 1,
  cost: 1,
  status: 'open',
  result: null,
  payout: null,
  pnl: null,
  openedAt: '2026-10-13T00:00:00Z',
  settledAt: null,
  chance: 0.1,
  entryChance: 0.1,
  value: 0.1,
  history: [],
  legs: Array.from({ length: n }, (_, i) => leg(i)),
})

const dots = (html: string) => html.match(/data-leg-dot/g)?.length ?? 0

describe('LegDots', () => {
  it('caps a 16-leg Combo card at MAX_LEG_DOTS dots and a +K', () => {
    const html = renderToStaticMarkup(
      <PredictionCard prediction={combo(16)} onSelect={() => {}} />,
    )
    expect(MAX_LEG_DOTS).toBe(6)
    expect(dots(html)).toBe(6)
    expect(html).toContain('+10')
    // The row can't push past the fixed-width card.
    expect(html).toMatch(/class="flex min-w-0 [^"]*overflow-hidden/)
  })

  it('shows every dot and no +K when the Legs fit', () => {
    const html = renderToStaticMarkup(
      <LegDots legs={combo(MAX_LEG_DOTS).legs} />,
    )
    expect(dots(html)).toBe(MAX_LEG_DOTS)
    expect(html).not.toMatch(/\+\d/)
  })
})
