import { describe, expect, it } from 'vitest'
import { formatPrice, maxCentsFor, payoutMultiplier } from '@/lib/model/price'

describe('payout multipliers', () => {
  it("are what $1 pays back after Kalshi's fee", () => {
    // 54¢ + 2¢ fee = 56¢ for $1.
    expect(payoutMultiplier(0.54)).toBe(1.79)
    // 20¢ + 2¢ (ceil 1.12¢) = 22¢.
    expect(payoutMultiplier(0.2)).toBe(4.55)
    // 99¢ + 1¢ = $1: you only get your money back.
    expect(payoutMultiplier(0.99)).toBe(1)
  })

  it('format as the Viewer chose', () => {
    expect(formatPrice(0.54, 'cents')).toBe('54¢')
    expect(formatPrice(0.54, 'multiplier')).toBe('1.79x')
    expect(formatPrice(0.5, 'multiplier')).toBe('1.92x')
  })

  it('turn back into the most a contract may cost', () => {
    // A price shown as 1.79x is one "at least 1.79x" takes.
    expect(maxCentsFor(1.79)).toBe(54)
    expect(maxCentsFor(payoutMultiplier(0.37))).toBe(37)
    // Cheaper is a bigger payout: the limit is the highest price that pays it.
    expect(payoutMultiplier(maxCentsFor(2)! / 100)).toBeGreaterThanOrEqual(2)
    expect(payoutMultiplier((maxCentsFor(2)! + 1) / 100)).toBeLessThan(2)
    expect(maxCentsFor(500)).toBeNull()
  })
})
