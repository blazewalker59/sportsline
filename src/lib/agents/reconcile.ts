/**
 * Settling approved orders whose outcome Sportsline doesn't know
 * (docs/adr/0008): Kalshi's reply was lost (`unknown`), or the Worker
 * stopped while one was `placing`. Each is looked up on Kalshi by its
 * client order id, the proposal's id, and recorded as filled, partial,
 * unfilled, or failed if Kalshi never received it. Run from the Viewer's
 * ViewerSync (docs/adr/0005). Server only.
 */

import { and, eq, inArray, lte } from 'drizzle-orm'
import { UNSETTLED, stored } from './proposal'
import { fillStatus, tradeAccount, tradeKeyRow } from './trading'
import type { TradeProposal } from './proposal'
import type { KalshiAccount } from '@/lib/kalshi/client'
import type { CloudflareEnv, Database } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import { tradeProposals } from '@/lib/db/schema'
import { loadAccount } from '@/lib/kalshi/account'
import { signedGet } from '@/lib/kalshi/client'

/**
 * Left this long before it's looked up: Kalshi lists an order as soon as
 * it's accepted, so one missing after this never arrived.
 */
export const SETTLE_AFTER_MS = 3 * 60_000

interface KalshiOrder {
  order_id: string
  client_order_id?: string
  status?: string
  fill_count?: number
  fill_count_fp?: string
}

interface KalshiFill {
  order_id?: string
  count?: number
  count_fp?: string
  yes_price_dollars?: string
  no_price_dollars?: string
  /** Dollars. */
  fee_cost?: string
}

/** Orders sent but not settled, old enough to look up. */
export function unsettledTrades(
  db: Database,
  viewerId: string,
  now = new Date(),
) {
  return db
    .select()
    .from(tradeProposals)
    .where(
      and(
        eq(tradeProposals.viewerId, viewerId),
        inArray(tradeProposals.status, UNSETTLED.map(stored)),
        lte(
          tradeProposals.decidedAt,
          new Date(now.getTime() - SETTLE_AFTER_MS).toISOString(),
        ),
      ),
    )
}

/** Our order on Kalshi, by its client order id; null if Kalshi has none. */
async function findOrder(
  account: KalshiAccount,
  p: TradeProposal,
): Promise<KalshiOrder | null> {
  // From a minute before it was approved, in seconds.
  const since = Math.floor(Date.parse(p.decidedAt ?? p.createdAt) / 1000) - 60
  let cursor = ''
  for (let page = 0; page < 5; page++) {
    const r = await signedGet<{ orders?: Array<KalshiOrder>; cursor?: string }>(
      account,
      `/portfolio/orders?ticker=${encodeURIComponent(p.marketTicker)}&min_ts=${since}&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    )
    const found = r.orders?.find((o) => o.client_order_id === p.id)
    if (found) return found
    cursor = r.cursor ?? ''
    if (!cursor) break
  }
  return null
}

/** What filled of an order: contracts, average price for our side, fees. */
async function fillsOf(
  account: KalshiAccount,
  p: TradeProposal,
  orderId: string,
): Promise<{ filled: number; avgPrice: number | null; fees: number }> {
  const r = await signedGet<{ fills?: Array<KalshiFill> }>(
    account,
    `/portfolio/fills?order_id=${encodeURIComponent(orderId)}&limit=200`,
  )
  let filled = 0
  let paid = 0
  let fees = 0
  for (const f of r.fills ?? []) {
    if (f.order_id && f.order_id !== orderId) continue
    const count = Number(f.count_fp ?? f.count ?? 0) || 0
    const yes = Number(f.yes_price_dollars)
    const price = p.side === 'yes' ? yes : Number(f.no_price_dollars ?? 1 - yes)
    filled += count
    paid += count * (Number.isFinite(price) ? price : 0)
    fees += Number(f.fee_cost) || 0
  }
  return { filled, avgPrice: filled > 0 ? paid / filled : null, fees }
}

/** Settle one order from Kalshi's record; false if it can't be yet. */
async function settle(
  db: Database,
  account: KalshiAccount,
  p: TradeProposal,
): Promise<boolean> {
  const order = await findOrder(account, p)
  let set: Partial<TradeProposal>
  if (!order) {
    set = {
      status: 'failed',
      error: 'Kalshi has no record of this order, so it wasn’t placed.',
    }
  } else {
    // Immediate-or-cancel: it's done at once, but wait out a resting one.
    if (order.status === 'resting') return false
    const fills = await fillsOf(account, p, order.order_id)
    const reported = Number(order.fill_count_fp ?? order.fill_count ?? 0) || 0
    // Fills not all listed yet: look again next run.
    if (reported > fills.filled) return false
    set = {
      status: fillStatus(fills.filled, p.count),
      orderId: order.order_id,
      filledCount: fills.filled,
      avgPriceDollars: fills.avgPrice,
      feesDollars: fills.fees,
      error: null,
    }
  }
  const { status, ...rest } = set
  // Only while still unsettled: never overwrite an outcome recorded since.
  const [row] = await db
    .update(tradeProposals)
    .set({ ...rest, status: stored(status!) })
    .where(
      and(
        eq(tradeProposals.id, p.id),
        inArray(tradeProposals.status, UNSETTLED.map(stored)),
      ),
    )
    .returning()
  return Boolean(row)
}

/**
 * Settle a Viewer's unsettled orders, read with their trade key (or their
 * read key, once the trade key is gone). Returns how many were settled.
 */
export async function reconcileTrades(
  env: CloudflareEnv,
  viewerId: string,
  now = new Date(),
): Promise<number> {
  const db = dbFromD1(env.DB)
  const open = await unsettledTrades(db, viewerId, now)
  if (open.length === 0) return 0
  const key = await tradeKeyRow(db, viewerId)
  const account = key
    ? await tradeAccount(env, key)
    : await loadAccount(env, viewerId)
  if (!account) return 0
  let settled = 0
  for (const p of open) if (await settle(db, account, p)) settled++
  return settled
}
