import { describe, expect, it } from 'vitest'
import {
  bannerVisible,
  kalshiEventUrl,
  kalshiSlug,
  slateSummary,
} from '@/lib/sharp/view'

describe('kalshiEventUrl', () => {
  it("links to the Game the way Kalshi's app shares it", () => {
    expect(
      kalshiEventUrl('KXNCAAFGAME-26OCT10INDNEB-IND', 'Indiana vs Nebraska'),
    ).toBe(
      'https://kalshi.com/markets/kxncaafgame/indiana-vs-nebraska/KXNCAAFGAME-26OCT10INDNEB',
    )
  })

  it("opens a spread or total pick on its Game's winner event", () => {
    expect(
      kalshiEventUrl(
        'KXNBASPREAD-26OCT05NYKPHI-NYK5',
        'New York vs Philadelphia',
      ),
    ).toBe(
      'https://kalshi.com/markets/kxnbagame/new-york-vs-philadelphia/KXNBAGAME-26OCT05NYKPHI',
    )
    expect(kalshiEventUrl('KXMLBTOTAL-26OCT071800LADATL-8')).toBe(
      'https://kalshi.com/markets/kxmlbgame/game/KXMLBGAME-26OCT071800LADATL',
    )
  })

  it("slugs Kalshi's titles", () => {
    expect(kalshiSlug('Morehead St. vs Dayton')).toBe('morehead-st-vs-dayton')
    expect(kalshiSlug('PHI Eagles vs JAC Jaguars')).toBe(
      'phi-eagles-vs-jac-jaguars',
    )
    expect(kalshiSlug('Texas A&M vs Missouri')).toBe('texas-am-vs-missouri')
  })

  it('falls back to the series for a bare ticker', () => {
    expect(kalshiEventUrl('KXNHLGAME')).toBe(
      'https://kalshi.com/markets/kxnhlgame/game/KXNHLGAME',
    )
  })
})

describe('slateSummary', () => {
  const single = (
    title: string,
    edge: number,
    grade: 'strong' | 'edge' | 'thin',
  ) => ({ kind: 'single', title, edge, grade }) as const

  it('counts picks, strong ones and the combo, led by the most edge', () => {
    expect(
      slateSummary([
        single('KC win', 0.031, 'strong'),
        single('Under 8.5', 0.012, 'edge'),
        single('BOS −1.5', 0.034, 'strong'),
        { kind: 'combo', title: '3-leg combo', edge: 0.05, grade: 'strong' },
      ]),
    ).toEqual({
      singles: 3,
      strong: 2,
      hasCombo: true,
      best: { title: 'BOS −1.5', edge: 0.034 },
    })
  })

  it('is empty without picks', () => {
    expect(slateSummary([])).toEqual({
      singles: 0,
      strong: 0,
      hasCombo: false,
      best: null,
    })
  })
})

describe('bannerVisible', () => {
  it('shows a slate not yet dismissed', () => {
    expect(bannerVisible('2026-10-06', null)).toBe(true)
    expect(bannerVisible('2026-10-06', '2026-10-05')).toBe(true)
  })

  it('hides once dismissed for that day, or with no slate', () => {
    expect(bannerVisible('2026-10-06', '2026-10-06')).toBe(false)
    expect(bannerVisible(null, null)).toBe(false)
  })
})
