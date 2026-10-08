/**
 * Following find_bet (docs/adr/0009): every ask and the Trend picks it
 * answered with, whether the Viewer placed each one, and how it settled.
 *
 * A pick counts as placed when the Viewer bought that side of that market
 * after it was suggested: a Prediction from the Kalshi sync (however they
 * traded), or an Agent's proposal they approved that filled. If the same
 * bet was suggested more than once, the latest suggestion before they
 * bought gets the credit. Results come from Kalshi's market result, or the
 * Prediction's own settlement when it was placed.
 */

import { and, eq, gte, inArray, isNull } from 'drizzle-orm'
import { serviceAccount } from './kalshi'
import type { BetAnswer, BetAsk } from './onDemand'
import type { CloudflareEnv, Database } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import {
  betRequests,
  predictions,
  tradeProposals,
  trendPicks,
} from '@/lib/db/schema'
import { markets } from '@/lib/kalshi/client'

export type TrendPickRow = typeof trendPicks.$inferSelect
export type BetRequestRow = typeof betRequests.$inferSelect

/** Picks are followed this long for a placement or a result. */
const FOLLOW_DAYS = 7

/** Store an ask and what it answered with. */
export async function recordRequest(
  db: Database,
  caller: { viewerId: string; tokenId: string; agentName: string },
  ask: BetAsk,
  answer: BetAnswer,
  now = new Date(),
): Promise<string> {
  const requestId = crypto.randomUUID()
  const at = now.toISOString()
  await db.insert(betRequests).values({
    id: requestId,
    viewerId: caller.viewerId,
    tokenId: caller.tokenId,
    agentName: caller.agentName,
    ask: {
      team: ask.team,
      league: ask.league ?? null,
      day: ask.day,
      count: ask.count,
      surprise: ask.surprise,
    },
    games: answer.games.length,
    picks: answer.picks.length,
    reason: answer.reason,
    createdAt: at,
  })
  if (answer.picks.length > 0) {
    await db.insert(trendPicks).values(
      answer.picks.map((p, i) => ({
        id: `${requestId}:${i + 1}`,
        requestId,
        viewerId: caller.viewerId,
        rank: i + 1,
        marketTicker: p.ticker,
        side: p.side,
        marketKind: p.key.kind,
        title: p.title,
        gameLabel: p.gameLabel,
        league: p.league,
        gameId: p.key.gameId,
        startsAt: p.startsAt,
        price: p.price,
        fair: p.fair,
        trendChance: p.trendChance,
        edge: p.edge,
        createdAt: at,
      })),
    )
  }
  return requestId
}

export interface Placement {
  viewerId: string
  marketTicker: string
  side: 'yes' | 'no'
  /** When they bought in. */
  at: string
  via: 'agent' | 'kalshi'
  contracts: number | null
  cost: number | null
  /** The Prediction's settlement, when it has one. */
  result?: 'won' | 'lost' | 'void' | null
  pnl?: number | null
}

/**
 * Which unplaced pick each placement belongs to: the latest suggestion of
 * that bet, to that Viewer, made before they bought. Pure.
 */
export function creditPlacements(
  picks: ReadonlyArray<
    Pick<
      TrendPickRow,
      'id' | 'viewerId' | 'marketTicker' | 'side' | 'createdAt' | 'placedAt'
    >
  >,
  placements: ReadonlyArray<Placement>,
): Map<string, Placement> {
  const credited = new Map<string, Placement>()
  // Earliest purchase first, so each takes the suggestion just before it.
  for (const pl of [...placements].sort((a, b) => a.at.localeCompare(b.at))) {
    const before = picks
      .filter(
        (p) =>
          !p.placedAt &&
          !credited.has(p.id) &&
          p.viewerId === pl.viewerId &&
          p.marketTicker === pl.marketTicker &&
          p.side === pl.side &&
          p.createdAt <= pl.at,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (before[0]) credited.set(before[0].id, pl)
  }
  return credited
}

/** A market's result for one side, once Kalshi has decided it. Pure. */
export function resultFor(
  marketResult: string | undefined,
  side: 'yes' | 'no',
): 'won' | 'lost' | null {
  return marketResult === 'yes' || marketResult === 'no'
    ? marketResult === side
      ? 'won'
      : 'lost'
    : null
}

/**
 * Follow the open picks: credit placements, and settle those whose games
 * have started. Run beside the Sharp picks' re-check.
 */
export async function trackTrendPicks(
  env: CloudflareEnv,
  now: Date,
): Promise<number> {
  const db = dbFromD1(env.DB)
  const since = new Date(now.getTime() - FOLLOW_DAYS * 86_400_000)
  const open = await db
    .select()
    .from(trendPicks)
    .where(
      and(
        isNull(trendPicks.result),
        gte(trendPicks.createdAt, since.toISOString()),
      ),
    )
  if (open.length === 0) return 0
  const viewers = [...new Set(open.map((p) => p.viewerId))]
  const tickers = [...new Set(open.map((p) => p.marketTicker))]

  // Placements: the Viewers' Predictions on these markets, and Agents'
  // approved proposals that filled (before the sync has seen them).
  const held = await db
    .select()
    .from(predictions)
    .where(
      and(
        inArray(predictions.viewerId, viewers),
        inArray(predictions.marketTicker, tickers),
        eq(predictions.kind, 'single'),
      ),
    )
  const filled = await db
    .select()
    .from(tradeProposals)
    .where(
      and(
        inArray(tradeProposals.viewerId, viewers),
        inArray(tradeProposals.marketTicker, tickers),
        eq(tradeProposals.action, 'buy'),
        inArray(tradeProposals.status, ['filled', 'partial']),
      ),
    )
  const byAgent = (viewerId: string, ticker: string, side: string) =>
    filled.find(
      (t) =>
        t.viewerId === viewerId && t.marketTicker === ticker && t.side === side,
    )
  const placements: Array<Placement> = held.map((h) => ({
    viewerId: h.viewerId,
    marketTicker: h.marketTicker,
    side: h.side,
    at: h.tradedAt ?? h.openedAt,
    via: byAgent(h.viewerId, h.marketTicker, h.side) ? 'agent' : 'kalshi',
    contracts: h.contracts,
    cost: h.cost,
    result: h.result,
    pnl: h.pnl,
  }))
  for (const t of filled) {
    if (
      held.some(
        (h) =>
          h.viewerId === t.viewerId &&
          h.marketTicker === t.marketTicker &&
          h.side === t.side,
      )
    )
      continue
    placements.push({
      viewerId: t.viewerId,
      marketTicker: t.marketTicker,
      side: t.side,
      at: t.decidedAt ?? t.createdAt,
      via: 'agent',
      contracts: t.filledCount,
      cost:
        (t.filledCount ?? 0) * (t.avgPriceDollars ?? 0) + (t.feesDollars ?? 0),
    })
  }
  const credited = creditPlacements(open, placements)

  // Results for picks whose games have started, from Kalshi.
  const started = open.filter((p) => Date.parse(p.startsAt) <= now.getTime())
  const account = started.length ? await serviceAccount(env, db) : null
  const byTicker = new Map(
    account
      ? (
          await markets(account, [
            ...new Set(started.map((p) => p.marketTicker)),
          ])
        ).map((m) => [m.ticker, m.result])
      : [],
  )

  const at = now.toISOString()
  let updated = 0
  for (const p of open) {
    const set: Partial<TrendPickRow> = {}
    const pl = credited.get(p.id)
    if (pl) {
      set.placedAt = pl.at
      set.placedVia = pl.via
      set.placedContracts = pl.contracts
      set.placedCost = pl.cost
    }
    const placed =
      pl ??
      (p.placedAt
        ? placements.find(
            (x) =>
              x.viewerId === p.viewerId &&
              x.marketTicker === p.marketTicker &&
              x.side === p.side,
          )
        : undefined)
    const result =
      placed?.result ?? resultFor(byTicker.get(p.marketTicker), p.side)
    if (result) {
      set.result = result
      set.settledAt = at
      if (placed?.pnl !== undefined && placed.pnl !== null) set.pnl = placed.pnl
    }
    if (Object.keys(set).length === 0) continue
    await db.update(trendPicks).set(set).where(eq(trendPicks.id, p.id))
    updated++
  }
  return updated
}

export interface TrendStats {
  requests: number
  /** Asks that found at least one pick. */
  answered: number
  picksOffered: number
  placed: number
  placedVia: { agent: number; kalshi: number }
  /** Of the placed picks. */
  won: number
  lost: number
  void: number
  pending: number
  /** Won over decided, of the placed picks (null: none decided yet). */
  winRate: number | null
  /** Profit or loss on placed picks that have settled (dollars). */
  pnl: number
  /** How the picks nobody placed turned out, for comparison. */
  skipped: { won: number; lost: number; pending: number }
}

/** The find_bet record. Pure. */
export function trendStats(
  requests: ReadonlyArray<Pick<BetRequestRow, 'picks'>>,
  picks: ReadonlyArray<
    Pick<TrendPickRow, 'placedAt' | 'placedVia' | 'result' | 'pnl'>
  >,
): TrendStats {
  const placed = picks.filter((p) => p.placedAt)
  const skipped = picks.filter((p) => !p.placedAt)
  const count = (rows: typeof picks, r: TrendPickRow['result']) =>
    rows.filter((p) => p.result === r).length
  const won = count(placed, 'won')
  const lost = count(placed, 'lost')
  return {
    requests: requests.length,
    answered: requests.filter((r) => r.picks > 0).length,
    picksOffered: picks.length,
    placed: placed.length,
    placedVia: {
      agent: placed.filter((p) => p.placedVia === 'agent').length,
      kalshi: placed.filter((p) => p.placedVia === 'kalshi').length,
    },
    won,
    lost,
    void: count(placed, 'void'),
    pending: count(placed, null),
    winRate: won + lost > 0 ? won / (won + lost) : null,
    pnl: Math.round(placed.reduce((n, p) => n + (p.pnl ?? 0), 0) * 100) / 100,
    skipped: {
      won: count(skipped, 'won'),
      lost: count(skipped, 'lost'),
      pending: count(skipped, null),
    },
  }
}

/** A Viewer's requests and picks, for the record. */
export async function viewerTrendRecord(db: Database, viewerId: string) {
  const [requests, picks] = await Promise.all([
    db.select().from(betRequests).where(eq(betRequests.viewerId, viewerId)),
    db.select().from(trendPicks).where(eq(trendPicks.viewerId, viewerId)),
  ])
  return { requests, picks, stats: trendStats(requests, picks) }
}
