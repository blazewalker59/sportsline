/**
 * Placing an approved order on Kalshi (docs/adr/0008), through its V2
 * order endpoint. Every order is a limit order that fills what it can at
 * once and cancels the rest (immediate-or-cancel), so nothing is left
 * resting for anyone to manage.
 */

import { signedPost } from './client'
import type { KalshiAccount } from './client'
import { kalshiFee } from '@/lib/sharp/engine'

export interface OrderIntent {
  side: 'yes' | 'no'
  action: 'buy' | 'sell'
  count: number
  /** Worst price per contract for the side traded, in cents (1–99). */
  limitCents: number
}

/**
 * Kalshi's V2 book quotes everything from the YES side: `bid` buys YES,
 * `ask` sells YES. NO trades the mirror: buying NO at 40¢ sells YES at
 * 60¢, selling NO at 40¢ buys YES at 60¢. Pure.
 */
export function bookOrder(
  o: Pick<OrderIntent, 'side' | 'action' | 'limitCents'>,
): {
  bookSide: 'bid' | 'ask'
  price: string
} {
  const buysYes =
    (o.side === 'yes' && o.action === 'buy') ||
    (o.side === 'no' && o.action === 'sell')
  const yesCents = o.side === 'yes' ? o.limitCents : 100 - o.limitCents
  return {
    bookSide: buysYes ? 'bid' : 'ask',
    price: (yesCents / 100).toFixed(2),
  }
}

/**
 * The most a buy can cost, fees included, in dollars; a sell's fees (what
 * it can cost you beyond the contracts you give up). Pure.
 */
export function maxCost(o: Omit<OrderIntent, 'side'>): number {
  const p = o.limitCents / 100
  const fees = kalshiFee(p) * o.count
  const dollars = o.action === 'buy' ? p * o.count + fees : fees
  return Math.round(dollars * 100) / 100
}

interface CreateOrderV2Response {
  order_id: string
  client_order_id?: string
  fill_count: string
  remaining_count: string
  /** YES-side price, as the book quotes it. */
  average_fill_price?: string
  average_fee_paid?: string
}

export interface OrderResult {
  orderId: string
  filled: number
  /** For the side traded, in dollars. */
  avgPrice: number | null
  fees: number
}

/**
 * Send the order. `clientOrderId` makes it idempotent at Kalshi: the same
 * proposal can never be placed twice. Sells only reduce a position.
 */
export async function placeOrder(
  account: KalshiAccount,
  ticker: string,
  o: OrderIntent,
  clientOrderId: string,
): Promise<OrderResult> {
  const { bookSide, price } = bookOrder(o)
  const r = await signedPost<CreateOrderV2Response>(
    account,
    '/portfolio/events/orders',
    {
      ticker,
      client_order_id: clientOrderId,
      side: bookSide,
      count: String(o.count),
      price,
      time_in_force: 'immediate_or_cancel',
      self_trade_prevention_type: 'taker_at_cross',
      reduce_only: o.action === 'sell',
    },
  )
  const filled = Number(r.fill_count) || 0
  const yesPrice = r.average_fill_price ? Number(r.average_fill_price) : null
  return {
    orderId: r.order_id,
    filled,
    avgPrice:
      yesPrice === null ? null : o.side === 'yes' ? yesPrice : 1 - yesPrice,
    fees: (Number(r.average_fee_paid) || 0) * filled,
  }
}
