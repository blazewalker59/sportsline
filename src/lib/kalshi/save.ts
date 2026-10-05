/**
 * Saving a Prediction (CONTEXT.md, "Prediction") for a Kalshi market, with
 * its Legs matched to our Games, Teams and Players. Server only.
 */

import { markets as fetchMarkets } from './client'
import { gameFor, subjectFor } from './matching'
import { legTitle, rememberMarkets, sqlExcluded } from './markets'
import type { KalshiAccount, KalshiLeg, KalshiMarket } from './client'
import type { CloudflareEnv, Database } from '@/lib/db'
import { predictionLegs, predictions } from '@/lib/db/schema'

export function predictionId(viewerId: string, ticker: string): string {
  return `${viewerId}~${ticker}`
}

/** Save a Prediction for a market, with its Legs (created or refreshed). Exported for scripts and tests. */
export async function savePrediction(
  env: CloudflareEnv,
  account: KalshiAccount,
  db: Database,
  viewerId: string,
  m: KalshiMarket,
  fields: {
    side: 'yes' | 'no'
    contracts: number
    cost: number
    status: 'open' | 'settled'
    result?: 'won' | 'lost' | 'void' | null
    payout?: number | null
    pnl?: number | null
    settledAt?: string | null
    /** Match Legs to our Games and Players (skipped for old history). */
    match?: boolean
  },
): Promise<void> {
  const id = predictionId(viewerId, m.ticker)
  const combo = (m.mve_selected_legs?.length ?? 0) > 0
  const legs: Array<KalshiLeg> = combo
    ? m.mve_selected_legs!
    : [
        {
          event_ticker: m.event_ticker,
          market_ticker: m.ticker,
          side: fields.side,
        },
      ]
  const legMarkets = combo
    ? await fetchMarkets(
        account,
        legs.map((l) => l.market_ticker),
      )
    : [m]
  await rememberMarkets(db, [m, ...(combo ? legMarkets : [])])
  const byTicker = new Map(legMarkets.map((x) => [x.ticker, x]))
  const now = new Date().toISOString()
  await db
    .insert(predictions)
    .values({
      id,
      viewerId,
      marketTicker: m.ticker,
      kind: combo ? 'combo' : 'single',
      side: fields.side,
      // A Combo reads as its Legs: "Washington wins · Not: Taylor 70+…".
      title: combo
        ? legs
            .map(
              (l) =>
                `${l.side === 'no' ? 'Not: ' : ''}${legTitle(byTicker.get(l.market_ticker), l.market_ticker)}`,
            )
            .join(' · ')
        : legTitle(m, m.ticker),
      contracts: fields.contracts,
      cost: fields.cost,
      status: fields.status,
      result: fields.result ?? null,
      payout: fields.payout ?? null,
      pnl: fields.pnl ?? null,
      openedAt: now,
      settledAt: fields.settledAt ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: predictions.id,
      set: {
        title: sqlExcluded('title'),
        side: fields.side,
        contracts: fields.contracts,
        cost: fields.cost,
        status: fields.status,
        result: fields.result ?? null,
        payout: fields.payout ?? null,
        pnl: fields.pnl ?? null,
        settledAt: fields.settledAt ?? null,
        updatedAt: now,
      },
    })
  const rows = []
  for (const [position, leg] of legs.entries()) {
    const lm = byTicker.get(leg.market_ticker)
    const matched =
      fields.match === false
        ? { gameId: null, league: null }
        : await gameFor(env, account, db, leg.event_ticker)
    const { gameId, league } = matched
    const { teamId, playerId } =
      fields.match === false
        ? { teamId: null, playerId: null }
        : await subjectFor(account, db, lm, league, gameId)
    rows.push({
      predictionId: id,
      position,
      marketTicker: leg.market_ticker,
      eventTicker: leg.event_ticker,
      side: leg.side,
      title: legTitle(lm, leg.market_ticker),
      gameId,
      teamId,
      playerId,
    })
  }
  if (rows.length > 0) {
    await db
      .insert(predictionLegs)
      .values(rows)
      .onConflictDoUpdate({
        target: [predictionLegs.predictionId, predictionLegs.position],
        set: {
          title: sqlExcluded('title'),
          gameId: sqlExcluded('game_id'),
          teamId: sqlExcluded('team_id'),
          playerId: sqlExcluded('player_id'),
        },
      })
  }
}
