import { describe, expect, it } from 'vitest'
import { bannerVisible, kalshiEventUrl, slateSummary } from '@/lib/sharp/view'

describe('kalshiEventUrl', () => {
  it('links a winner market to its event page', () => {
    expect(kalshiEventUrl('KXNFLGAME-26OCT05KCJAX-KC')).toBe(
      'https://kalshi.com/markets/kxnflgame/game/kxnflgame-26oct05kcjax',
    )
  })

  it('drops a spread or total strike from the event', () => {
    expect(kalshiEventUrl('KXNBASPREAD-26OCT05NYKPHI-NYK5')).toBe(
      'https://kalshi.com/markets/kxnbaspread/game/kxnbaspread-26oct05nykphi',
    )
    expect(kalshiEventUrl('KXMLBTOTAL-26OCT071800LADATL-8')).toBe(
      'https://kalshi.com/markets/kxmlbtotal/game/kxmlbtotal-26oct071800ladatl',
    )
  })

  it('falls back to the series for a bare ticker', () => {
    expect(kalshiEventUrl('KXNHLGAME')).toBe(
      'https://kalshi.com/markets/kxnhlgame/game/kxnhlgame',
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
