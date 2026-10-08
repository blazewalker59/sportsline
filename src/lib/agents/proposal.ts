/**
 * Trade proposals in plain terms (docs/adr/0008): their words, status and
 * cost against the Viewer's limits. Pure; shared by the server and the
 * Agents page.
 */

import type { tradeProposals } from '@/lib/db/schema'
import type { PriceDisplay } from '@/lib/model/price'
import { formatPrice } from '@/lib/model/price'

export type TradeProposal = typeof tradeProposals.$inferSelect
type Status = TradeProposal['status']

/** Approved orders that count toward the day's cap. */
export const SPENDING: Array<Status> = ['placing', 'filled', 'partial']

/** What an approved order cost (or may yet cost, while it's placing). Pure. */
export function spentOn(p: TradeProposal): number {
  if (p.status === 'placing') return p.maxCostDollars
  const fees = p.feesDollars ?? 0
  return p.action === 'buy'
    ? (p.filledCount ?? 0) * (p.avgPriceDollars ?? 0) + fees
    : fees
}

/** Why an order would break the caps, or null if it fits. Pure. */
export function capProblem(
  cost: number,
  caps: { maxOrderDollars: number; maxDailyDollars: number },
  spentSoFar: number,
): string | null {
  const money = (n: number) => `$${n.toFixed(2)}`
  if (cost > caps.maxOrderDollars) {
    return `This order could cost ${money(cost)}, over the ${money(caps.maxOrderDollars)} limit per order.`
  }
  if (spentSoFar + cost > caps.maxDailyDollars) {
    return `This order could cost ${money(cost)}, and ${money(spentSoFar)} has been spent today of the ${money(caps.maxDailyDollars)} daily limit.`
  }
  return null
}

/** A proposal's status, with one past its deadline read as expired. Pure. */
export function statusOf(p: TradeProposal, now: number): Status {
  return p.status === 'pending' && Date.parse(p.expiresAt) <= now
    ? 'expired'
    : p.status
}

/**
 * The order in words: "Buy 10 YES at up to 54¢" (or, as a multiplier,
 * "Buy 10 YES paying 1.79x or more"); "Sell 10 NO for at least 60¢". Pure.
 */
export function describeOrder(
  p: Pick<TradeProposal, 'action' | 'count' | 'side' | 'limitCents'>,
  display: PriceDisplay = 'cents',
): string {
  const what = `${p.count} ${p.side.toUpperCase()}`
  if (p.action === 'sell') return `Sell ${what} for at least ${p.limitCents}¢`
  return display === 'multiplier'
    ? `Buy ${what} paying ${formatPrice(p.limitCents / 100, display)} or more`
    : `Buy ${what} at up to ${p.limitCents}¢`
}
