import { describe, expect, it } from 'vitest'
import type { PickOutcome } from '@/lib/sharp/record'
import { picksRecord } from '@/lib/sharp/record'

const pick = (over: Partial<PickOutcome>): PickOutcome => ({
  kind: 'single',
  grade: 'strong',
  price: 0.5,
  fair: 0.55,
  closingPrice: null,
  result: null,
  ...over,
})

describe('the picks’ record', () => {
  it('measures closing line value, results and return', () => {
    const r = picksRecord([
      pick({ closingPrice: 0.56, result: 'won' }),
      pick({ closingPrice: 0.47, result: 'lost', grade: 'edge' }),
      pick({ closingPrice: 0.53 }),
      pick({ kind: 'combo', price: 0.2, closingPrice: 0.22, result: 'lost' }),
    ])
    expect(r.singles).toMatchObject({
      picks: 3,
      closed: 3,
      beatClose: 2,
      won: 1,
      lost: 1,
    })
    expect(r.singles.avgClv).toBeCloseTo((0.06 - 0.03 + 0.03) / 3)
    // Won 48¢, lost 52¢, on $1 of contracts: −4%.
    expect(r.singles.roi).toBeCloseTo(-0.04)
    expect(r.byGrade[0]).toMatchObject({ label: 'Strong', picks: 2 })
    expect(r.combos).toMatchObject({ picks: 1, lost: 1 })
  })
})
