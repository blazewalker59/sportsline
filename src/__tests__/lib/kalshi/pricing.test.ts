import { describe, expect, it } from 'vitest'
import {
  bookChance,
  comboChance,
  positionValue,
  predictionYesChance,
} from '@/lib/kalshi/pricing'

const empty = { yesBid: 0, yesAsk: 1, lastPrice: 0.102 }

describe('pricing a Prediction', () => {
  it('reads a book’s midpoint, and an empty book’s last trade', () => {
    expect(bookChance({ yesBid: 0.35, yesAsk: 0.36, lastPrice: 0.3 })).toBe(
      0.355,
    )
    expect(bookChance(empty)).toBe(0.102)
  })

  it('prices a Combo from its Legs: won Legs count 1, a lost one ends it', () => {
    const legs = [
      { side: 'yes' as const, yesChance: 0.175 },
      { side: 'yes' as const, yesChance: 0.215 },
      { side: 'yes' as const, yesChance: null, result: 'yes' },
      { side: 'yes' as const, yesChance: null, result: 'yes' },
    ]
    expect(comboChance(legs)).toBeCloseTo(0.0376, 4)
    expect(
      comboChance([...legs, { side: 'yes', yesChance: 0.5, result: 'no' }]),
    ).toBe(0)
    expect(comboChance([{ side: 'no', yesChance: 0.2 }])).toBeCloseTo(0.8)
    expect(comboChance([{ side: 'yes', yesChance: null }])).toBeNull()
  })

  it('values a Combo at its Legs’ chance, not the empty book’s $0 bid', () => {
    // A real six-team Combo: 123.45 contracts, Legs from 35% to 98%.
    const legs = [0.355, 0.725, 0.675, 0.755, 0.825, 0.985].map((c) => ({
      side: 'yes' as const,
      yesChance: c,
    }))
    const yes = predictionYesChance('combo', empty, legs)
    expect(yes).toBeCloseTo(0.1066, 3)
    expect(positionValue('yes', 123.45, empty, yes)).toBeCloseTo(13.16, 1)
  })

  it('values a single at its bid', () => {
    const book = { yesBid: 0.6, yesAsk: 0.62, lastPrice: 0.61 }
    const yes = predictionYesChance('single', book, [])
    expect(positionValue('yes', 10, book, yes)).toBeCloseTo(6)
    expect(positionValue('no', 10, book, yes)).toBeCloseTo(3.8)
  })
})
