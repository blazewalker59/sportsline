import { describe, expect, it } from 'vitest'
import {
  acceptSide,
  bestQuote,
  eventUrl,
  heldOn,
  limitFor,
  proceeds,
  quotePrice,
  sellCents,
  validCount,
} from '@/lib/kalshi/cashOut'

describe('sellCents', () => {
  it('sells YES at the YES bid and NO at the NO bid', () => {
    const book = { yesBid: 0.61, noBid: 0.37 }
    expect(sellCents('yes', book)).toBe(61)
    expect(sellCents('no', book)).toBe(37)
  })

  it('has no price when no one is bidding', () => {
    expect(sellCents('yes', { yesBid: 0, noBid: 0.4 })).toBeNull()
    expect(sellCents('no', { yesBid: 0.6, noBid: null })).toBeNull()
  })
})

describe('limitFor', () => {
  it('allows 2¢ under the price, never under 1¢', () => {
    expect(limitFor(61)).toBe(59)
    expect(limitFor(2)).toBe(1)
  })
})

describe('proceeds', () => {
  it('takes Kalshi’s fee from what the contracts bring', () => {
    // 120 at 60¢: $72.00; the fee is 7% of 120 · 0.6 · 0.4 = $2.016,
    // rounded up once for the trade.
    expect(proceeds(120, 0.6)).toEqual({ gross: 72, fees: 2.02, net: 69.98 })
  })
})

describe('quotes', () => {
  const quotes = [
    {
      id: 'a',
      yes_bid_dollars: '0.300',
      no_bid_dollars: '0.650',
      status: 'open' as const,
    },
    {
      id: 'b',
      yes_bid_dollars: '0.312',
      no_bid_dollars: '0.600',
      status: 'open' as const,
    },
    {
      id: 'c',
      yes_bid_dollars: '0.400',
      no_bid_dollars: '0.700',
      status: 'cancelled' as const,
    },
  ]

  it('prices selling YES at a maker’s YES bid and NO at its NO bid', () => {
    expect(quotePrice('yes', quotes[0])).toBe(0.3)
    expect(quotePrice('no', quotes[0])).toBe(0.65)
    expect(quotePrice('yes', { yes_bid_dollars: '0.00' })).toBeNull()
  })

  it('takes the best open quote for the side held', () => {
    expect(bestQuote('yes', quotes)).toMatchObject({
      quote: { id: 'b' },
      price: 0.312,
    })
    expect(bestQuote('no', quotes)).toMatchObject({
      quote: { id: 'a' },
      price: 0.65,
    })
    expect(bestQuote('yes', [])).toBeNull()
  })

  it('accepts the opposite side to sell: selling YES buys NO, which nets', () => {
    expect(acceptSide('yes')).toBe('no')
    expect(acceptSide('no')).toBe('yes')
  })
})

describe('what can be sold', () => {
  it('reads contracts held on the side from Kalshi’s signed position', () => {
    expect(heldOn('yes', 120)).toBe(120)
    expect(heldOn('no', -40)).toBe(40)
    // Held on the other side: nothing to sell on this one.
    expect(heldOn('yes', -40)).toBe(0)
  })

  it('takes a positive count in hundredths, no more than held', () => {
    expect(validCount(120, 120)).toBe(true)
    expect(validCount(12.5, 120)).toBe(true)
    expect(validCount(121, 120)).toBe(false)
    expect(validCount(0, 120)).toBe(false)
    expect(validCount(1.234, 120)).toBe(false)
  })
})

describe('eventUrl', () => {
  it('is Kalshi’s market path, lower-cased', () => {
    expect(eventUrl('KXNFLGAME', 'KXNFLGAME-26NOV26KCBUF')).toBe(
      'https://kalshi.com/markets/kxnflgame/kxnflgame-26nov26kcbuf',
    )
  })
})
