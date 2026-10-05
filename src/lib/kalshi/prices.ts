/**
 * Odds over time: every watched market's latest prices, a point of history
 * a minute for each Prediction, and pruning what no one watches. Server
 * only.
 */

import { eq, inArray, ne, sql } from 'drizzle-orm'
import { loadAccount } from './account'
import { markets as fetchMarkets } from './client'
import { dollars, rememberMarkets } from './markets'
import { bookChance, predictionYesChance } from './pricing'
import type { KalshiMarket } from './client'
import type { CloudflareEnv } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import {
  kalshiMarkets,
  kalshiPrices,
  predictionLegs,
  predictions,
} from '@/lib/db/schema'

/**
 * Latest prices for every market an open Prediction depends on, plus a
 * point of history a minute for each Prediction's own market. Each
 * Viewer's markets are read with their own key (see client.ts).
 */
export async function refreshPrices(
  env: Pick<CloudflareEnv, 'DB' | 'KALSHI_ENCRYPTION_KEY'>,
): Promise<number> {
  const db = dbFromD1(env.DB)
  const open = await db
    .select({
      ticker: predictions.marketTicker,
      id: predictions.id,
      viewerId: predictions.viewerId,
      kind: predictions.kind,
    })
    .from(predictions)
    .where(eq(predictions.status, 'open'))
  if (open.length === 0) return 0
  // In parts: D1 binds at most 100 parameters.
  const legs: Array<{
    ticker: string
    predictionId: string
    side: 'yes' | 'no'
  }> = []
  for (let i = 0; i < open.length; i += 80) {
    legs.push(
      ...(await db
        .select({
          ticker: predictionLegs.marketTicker,
          predictionId: predictionLegs.predictionId,
          side: predictionLegs.side,
        })
        .from(predictionLegs)
        .where(
          inArray(
            predictionLegs.predictionId,
            open.slice(i, i + 80).map((o) => o.id),
          ),
        )),
    )
  }
  const at = new Date().toISOString().slice(0, 16)
  const own = new Set(open.map((o) => o.ticker))
  const done = new Set<string>()
  let count = 0
  for (const viewerId of new Set(open.map((o) => o.viewerId))) {
    const ids = new Set(
      open.filter((o) => o.viewerId === viewerId).map((o) => o.id),
    )
    const tickers = [
      ...new Set([
        ...open.filter((o) => ids.has(o.id)).map((o) => o.ticker),
        ...legs.filter((l) => ids.has(l.predictionId)).map((l) => l.ticker),
      ]),
    ].filter((t) => !done.has(t))
    if (tickers.length === 0) continue
    const account = await loadAccount(env, viewerId).catch(() => null)
    if (!account) continue
    const latest = await fetchMarkets(account, tickers).catch(
      (error: unknown) => {
        console.error('Kalshi prices failed', { error: String(error) })
        return []
      },
    )
    await rememberMarkets(db, latest)
    for (const m of latest) done.add(m.ticker)
    count += latest.length
  }
  // A point of history for each Prediction's own market, from everything
  // just stored: a Combo's from its Legs (its own book is empty).
  const tickers = [...new Set([...own, ...legs.map((l) => l.ticker)])]
  const stored = new Map<string, typeof kalshiMarkets.$inferSelect>()
  for (let i = 0; i < tickers.length; i += 80) {
    for (const m of await db
      .select()
      .from(kalshiMarkets)
      .where(inArray(kalshiMarkets.ticker, tickers.slice(i, i + 80))))
      stored.set(m.ticker, m)
  }
  const points = new Map<string, number>()
  for (const o of open) {
    const chance = predictionYesChance(
      o.kind,
      stored.get(o.ticker),
      legs
        .filter((l) => l.predictionId === o.id)
        .map((l) => {
          const m = stored.get(l.ticker)
          return {
            side: l.side,
            yesChance: m ? bookChance(m) : null,
            result: m?.result,
          }
        }),
    )
    if (chance !== null) points.set(o.ticker, chance)
  }
  const rows = [...points].map(([ticker, chance]) => ({ ticker, at, chance }))
  for (let i = 0; i < rows.length; i += 30) {
    await db
      .insert(kalshiPrices)
      .values(rows.slice(i, i + 30))
      .onConflictDoNothing()
  }
  return count
}

/** A market's YES chance (0–1) as Kalshi reports it (see pricing.ts). */
export function chanceOf(m: KalshiMarket): number | null {
  return bookChance({
    yesBid: m.yes_bid_dollars ? dollars(m.yes_bid_dollars) : null,
    yesAsk: m.yes_ask_dollars ? dollars(m.yes_ask_dollars) : null,
    lastPrice: m.last_price_dollars ? dollars(m.last_price_dollars) : null,
  })
}

/** Drop price history for markets no open Prediction watches any more. */
export async function pruneHistory(
  env: Pick<CloudflareEnv, 'DB'>,
): Promise<void> {
  const db = dbFromD1(env.DB)
  const watched = db
    .select({ ticker: predictions.marketTicker })
    .from(predictions)
    .where(ne(predictions.status, 'closed'))
  await db
    .delete(kalshiPrices)
    .where(sql`${kalshiPrices.ticker} not in ${watched}`)
}
