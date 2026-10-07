import { describe, expect, it } from 'vitest'
import type { TradeProposal } from '@/lib/agents/proposal'
import {
  capProblem,
  describeOrder,
  spentOn,
  statusOf,
} from '@/lib/agents/proposal'

const base: TradeProposal = {
  id: 'p1',
  viewerId: 'u1',
  tokenId: 't1',
  agentName: 'Grok',
  marketTicker: 'T',
  marketTitle: 'Edmonton vs Anaheim · Edmonton',
  side: 'yes',
  action: 'buy',
  count: 10,
  limitCents: 54,
  maxCostDollars: 5.6,
  note: null,
  status: 'pending',
  createdAt: '2026-10-07T20:00:00.000Z',
  expiresAt: '2026-10-07T20:10:00.000Z',
  decidedAt: null,
  approvedDay: null,
  orderId: null,
  filledCount: null,
  avgPriceDollars: null,
  feesDollars: null,
  error: null,
}

describe('trade proposals', () => {
  it('read as the order they place', () => {
    expect(describeOrder(base)).toBe('Buy 10 YES at up to 54¢')
    expect(describeOrder({ ...base, action: 'sell', side: 'no' })).toBe(
      'Sell 10 NO for at least 54¢',
    )
  })

  it('lapse when nobody decides in time', () => {
    const at = Date.parse(base.expiresAt)
    expect(statusOf(base, at - 1)).toBe('pending')
    expect(statusOf(base, at)).toBe('expired')
    expect(statusOf({ ...base, status: 'filled' }, at + 1)).toBe('filled')
  })

  it('count what they cost: the most while placing, then the fills', () => {
    expect(spentOn({ ...base, status: 'placing' })).toBe(5.6)
    expect(
      spentOn({
        ...base,
        status: 'partial',
        filledCount: 4,
        avgPriceDollars: 0.53,
        feesDollars: 0.08,
      }),
    ).toBeCloseTo(2.2)
    expect(
      spentOn({ ...base, action: 'sell', status: 'filled', feesDollars: 0.1 }),
    ).toBe(0.1)
  })

  it('stay within the per-order and daily limits', () => {
    const caps = { maxOrderDollars: 25, maxDailyDollars: 100 }
    expect(capProblem(25, caps, 75)).toBeNull()
    expect(capProblem(25.01, caps, 0)).toMatch(
      /over the \$25\.00 limit per order/,
    )
    expect(capProblem(20, caps, 85)).toMatch(/\$85\.00 has been spent today/)
  })
})
