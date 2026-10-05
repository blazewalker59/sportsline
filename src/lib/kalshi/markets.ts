/**
 * Kalshi markets as we store them: their latest prices, titles and
 * results (kalshi_markets). Server only.
 */

import { sql } from 'drizzle-orm'
import type { KalshiMarket } from './client'
import type { Database } from '@/lib/db'
import { kalshiMarkets } from '@/lib/db/schema'

/** Kalshi's fixed-point dollar strings as numbers. */
export const dollars = (v: string | undefined): number => Number(v ?? 0) || 0

export const sqlExcluded = (column: string) => sql.raw(`excluded.${column}`)

/** Store a market's latest prices and title. */
export async function rememberMarkets(
  db: Database,
  list: ReadonlyArray<KalshiMarket>,
): Promise<void> {
  const now = new Date().toISOString()
  for (let i = 0; i < list.length; i += 10) {
    const part = list.slice(i, i + 10)
    await db
      .insert(kalshiMarkets)
      .values(
        part.map((m) => ({
          ticker: m.ticker,
          eventTicker: m.event_ticker,
          title: m.title ?? m.ticker,
          yesBid: m.yes_bid_dollars ? dollars(m.yes_bid_dollars) : null,
          yesAsk: m.yes_ask_dollars ? dollars(m.yes_ask_dollars) : null,
          lastPrice: m.last_price_dollars
            ? dollars(m.last_price_dollars)
            : null,
          floorStrike:
            typeof m.floor_strike === 'number' ? m.floor_strike : null,
          status: m.status ?? null,
          result: m.result ?? null,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: kalshiMarkets.ticker,
        set: {
          title: sqlExcluded('title'),
          yesBid: sqlExcluded('yes_bid'),
          yesAsk: sqlExcluded('yes_ask'),
          lastPrice: sqlExcluded('last_price'),
          floorStrike: sqlExcluded('floor_strike'),
          status: sqlExcluded('status'),
          result: sqlExcluded('result'),
          updatedAt: sqlExcluded('updated_at'),
        },
      })
  }
}

/** A leg's readable title: a game winner reads as the team. */
export function legTitle(
  m: KalshiMarket | undefined,
  fallback: string,
): string {
  return m?.title ?? m?.yes_sub_title ?? fallback
}
