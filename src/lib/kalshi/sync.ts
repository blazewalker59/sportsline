/**
 * Keeping Viewers' Predictions current (CONTEXT.md, "Prediction"). Server
 * only: run by the Scheduler, and once when a Viewer connects.
 *
 * - syncAccount: the Viewer's open positions and recent settlements become
 *   Predictions (save.ts), each with its Legs matched to our Games, Teams,
 *   Players (matching.ts).
 * - refreshPrices (prices.ts): every watched market's latest prices, and a
 *   point of history a minute for the Predictions themselves.
 */

import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { loadAccount } from './account'
import {
  KalshiError,
  market as fetchMarket,
  markets as fetchMarkets,
  firstBuys,
  openPositions,
  recentSettlements,
} from './client'
import { dollars } from './markets'
import { predictionId, savePrediction } from './save'
import { payoutOf } from './settlement'
import type { CloudflareEnv } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import { kalshiAccounts, predictions } from '@/lib/db/schema'
import { reportError } from '@/lib/ops/errors'

export { loadAccount } from './account'
export { savePrediction } from './save'
export { payoutOf } from './settlement'
export { chanceOf, pruneHistory, refreshPrices } from './prices'

/** Predictions dated from Kalshi's fills per sync. */
const DATED_PER_SYNC = 200
/** New settled Predictions taken per sync (history fills in over runs). */
const SETTLED_PER_RUN = 40
/** Settled Predictions this recent are matched to Games; older aren't. */
const MATCH_SETTLED_MS = 14 * 86_400_000

/** Bring one Viewer's Predictions up to date from their Kalshi account. */
export async function syncAccount(
  env: CloudflareEnv,
  viewerId: string,
): Promise<{ open: number; settled: number }> {
  const db = dbFromD1(env.DB)
  const account = await loadAccount(env, viewerId)
  if (!account) return { open: 0, settled: 0 }
  try {
    const [positions, settlements] = await Promise.all([
      openPositions(account),
      recentSettlements(account),
    ])
    const held = positions.filter((p) => dollars(p.position_fp) !== 0)
    const known = new Map(
      (
        await db
          .select({
            ticker: predictions.marketTicker,
            status: predictions.status,
          })
          .from(predictions)
          .where(eq(predictions.viewerId, viewerId))
      ).map((r) => [r.ticker, r.status]),
    )

    // A rate limit mid-sync stops it here: what's left waits for the next
    // run rather than failing the whole sync. Any other trouble with one
    // Prediction is logged and the rest carry on.
    let limited = false
    const each = async (what: string, save: () => Promise<void>) => {
      if (limited) return false
      try {
        await save()
        return true
      } catch (error) {
        if (error instanceof KalshiError && error.status === 429) {
          limited = true
        } else {
          await reportError(env, 'kalshi', error, {
            viewerId,
            step: 'prediction',
            what,
          })
        }
        return false
      }
    }

    // Open positions.
    const heldMarkets = new Map(
      (
        await fetchMarkets(
          account,
          held.map((p) => p.ticker),
        )
      ).map((m) => [m.ticker, m]),
    )
    for (const p of held) {
      await each(p.ticker, async () => {
        const m =
          heldMarkets.get(p.ticker) ?? (await fetchMarket(account, p.ticker))
        if (!m) return
        const position = dollars(p.position_fp)
        await savePrediction(env, account, db, viewerId, m, {
          side: position > 0 ? 'yes' : 'no',
          contracts: Math.abs(position),
          cost: dollars(p.market_exposure_dollars),
          status: 'open',
        })
      })
    }

    // Settled ones new to us (or that we had as open), a few per run so a
    // long history fills in over several syncs. Only recent ones are
    // matched to Games: old history just keeps its result.
    const fresh = settlements
      .filter((s) => known.get(s.ticker) !== 'settled')
      .slice(0, SETTLED_PER_RUN)
    const settledMarkets = new Map(
      (
        await fetchMarkets(
          account,
          fresh.map((s) => s.ticker),
        )
      ).map((m) => [m.ticker, m]),
    )
    let settledCount = 0
    for (const s of fresh) {
      const saved = await each(s.ticker, async () => {
        const m =
          settledMarkets.get(s.ticker) ?? (await fetchMarket(account, s.ticker))
        if (!m) return
        const yes = dollars(s.yes_count_fp)
        const no = dollars(s.no_count_fp)
        const side: 'yes' | 'no' = yes >= no ? 'yes' : 'no'
        const cost =
          dollars(s.yes_total_cost_dollars) + dollars(s.no_total_cost_dollars)
        const result =
          s.market_result === side
            ? 'won'
            : s.market_result === 'yes' || s.market_result === 'no'
              ? 'lost'
              : 'void'
        const payout = payoutOf(s, side, result)
        const settledAt = s.settled_time ?? new Date().toISOString()
        await savePrediction(env, account, db, viewerId, m, {
          side,
          contracts: Math.max(yes, no),
          cost,
          status: 'settled',
          result,
          payout,
          pnl: payout - cost - dollars(s.fee_cost),
          settledAt,
          match: Date.now() - Date.parse(settledAt) < MATCH_SETTLED_MS,
        })
      })
      if (saved) settledCount++
    }

    // Wins stored before payoutOf's fallback, with no payout: each winning
    // contract paid $1. The fee is already in their P&L, so it carries.
    await db
      .update(predictions)
      .set({
        payout: sql`${predictions.contracts}`,
        pnl: sql`coalesce(${predictions.pnl}, -${predictions.cost}) + ${predictions.contracts}`,
      })
      .where(
        and(
          eq(predictions.viewerId, viewerId),
          eq(predictions.status, 'settled'),
          eq(predictions.result, 'won'),
          or(isNull(predictions.payout), eq(predictions.payout, 0)),
        ),
      )

    // Open Predictions no longer held and not settled were sold: closed.
    const stillHeld = new Set(held.map((p) => p.ticker))
    const settledNow = new Set(settlements.map((s) => s.ticker))
    const gone = [...known]
      .filter(
        ([ticker, status]) =>
          status === 'open' &&
          !stillHeld.has(ticker) &&
          !settledNow.has(ticker),
      )
      .map(([ticker]) => predictionId(viewerId, ticker))
    for (let i = 0; i < gone.length; i += 80) {
      await db
        .update(predictions)
        .set({ status: 'closed', updatedAt: new Date().toISOString() })
        .where(inArray(predictions.id, gone.slice(i, i + 80)))
    }

    // When each Prediction was really made (first sight is just when we
    // saw it): filled in from Kalshi's fills, a batch a sync.
    if (!limited) {
      const undated = await db
        .select({ id: predictions.id, ticker: predictions.marketTicker })
        .from(predictions)
        .where(
          and(eq(predictions.viewerId, viewerId), isNull(predictions.tradedAt)),
        )
        .limit(DATED_PER_SYNC)
      if (undated.length > 0) {
        const found = await firstBuys(
          account,
          undated.map((u) => u.ticker),
        ).catch(async (error: unknown) => {
          await reportError(env, 'kalshi', error, { viewerId, step: 'fills' })
          return null
        })
        // Couldn't read the fills: try again next sync, don't guess.
        for (const u of found ? undated : []) {
          // Not in the fills (older than Kalshi keeps): when it settled,
          // else when we first saw it, so it isn't asked about again.
          await db
            .update(predictions)
            .set({
              tradedAt:
                found!.get(u.ticker) ??
                sql`coalesce(${predictions.settledAt}, ${predictions.openedAt})`,
            })
            .where(eq(predictions.id, u.id))
        }
      }
    }

    await db
      .update(kalshiAccounts)
      .set({
        status: 'ok',
        lastError: limited
          ? 'Kalshi asked us to slow down; the rest syncs shortly.'
          : null,
        syncedAt: new Date().toISOString(),
      })
      .where(eq(kalshiAccounts.viewerId, viewerId))
    return { open: held.length, settled: settledCount }
  } catch (error) {
    await db
      .update(kalshiAccounts)
      .set({
        status: 'error',
        lastError: String(error).slice(0, 300),
        syncedAt: new Date().toISOString(),
      })
      .where(eq(kalshiAccounts.viewerId, viewerId))
    throw error
  }
}

/** Accounts due a sync (not synced in `everyMs`), oldest first. */
export async function accountsDue(
  env: Pick<CloudflareEnv, 'DB'>,
  everyMs: number,
  limit: number,
): Promise<Array<string>> {
  const cutoff = new Date(Date.now() - everyMs).toISOString()
  const rows = await dbFromD1(env.DB)
    .select({ viewerId: kalshiAccounts.viewerId })
    .from(kalshiAccounts)
    .where(
      or(
        sql`${kalshiAccounts.syncedAt} is null`,
        lt(kalshiAccounts.syncedAt, cutoff),
      ),
    )
    .orderBy(kalshiAccounts.syncedAt)
    .limit(limit)
  return rows.map((r) => r.viewerId)
}
