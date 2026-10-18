/**
 * The Viewer's Predictions over HTTP: each with its Odds, Legs and
 * Progress for the Predictions screen, and compactly for their Record
 * (CONTEXT.md).
 */

import { createServerFn } from '@tanstack/react-start'
import { aliasedTable, and, desc, eq, gte, inArray } from 'drizzle-orm'
import { progressOf } from './props'
import { bookChance, positionValue, predictionYesChance } from './pricing'
import { inChunks } from './inChunks'
import type { Progress } from './props'
import type { RecordEntry } from './record'
import type { GameSummary } from '@/lib/model/timeline'
import {
  games,
  kalshiMarkets,
  kalshiPrices,
  players,
  predictionLegs,
  predictions,
  teams,
} from '@/lib/db/schema'
import { toGameSummary } from '@/lib/live/rows'
import { sessionViewer, withViewer } from '@/lib/viewer/session'

export interface LegView {
  title: string
  side: 'yes' | 'no'
  /** The chance this Leg goes the Viewer's way (0–1), if priced. */
  chance: number | null
  status: 'pending' | 'won' | 'lost'
  game: GameSummary | null
  playerId: string | null
  playerName: string | null
  teamId: string | null
  /** A stat prop's count so far against its line (212 of 300 rec yds). */
  progress: Progress | null
}

export interface PredictionView {
  id: string
  kind: 'single' | 'combo'
  side: 'yes' | 'no'
  title: string
  contracts: number
  cost: number
  status: 'open' | 'settled' | 'closed'
  result: 'won' | 'lost' | 'void' | null
  payout: number | null
  pnl: number | null
  openedAt: string
  settledAt: string | null
  /** The chance of the Viewer's side now (0–1), if priced. */
  chance: number | null
  /** The chance they got in at: what they paid per contract. */
  entryChance: number | null
  /** What the position would sell for now (dollars), if priced. */
  value: number | null
  /** The Viewer's side's chance over the last day, oldest first. */
  history: Array<{ at: string; chance: number }>
  legs: Array<LegView>
}

const HISTORY_MS = 24 * 3_600_000
const SETTLED_SHOWN = 100

export const getPredictions = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<PredictionView>> => {
    const viewer = await sessionViewer()
    if (!viewer) return []
    return withViewer(async ({ db, viewerId }) => {
      const [open, settled] = await Promise.all([
        db
          .select()
          .from(predictions)
          .where(
            and(
              eq(predictions.viewerId, viewerId),
              eq(predictions.status, 'open'),
            ),
          )
          .orderBy(desc(predictions.openedAt)),
        db
          .select()
          .from(predictions)
          .where(
            and(
              eq(predictions.viewerId, viewerId),
              inArray(predictions.status, ['settled', 'closed']),
            ),
          )
          .orderBy(desc(predictions.settledAt), desc(predictions.updatedAt))
          .limit(SETTLED_SHOWN),
      ])
      const all = [...open, ...settled]
      if (all.length === 0) return []
      const ids = all.map((p) => p.id)

      // In parts: D1 binds at most 100 parameters, and history grows.
      const legs = await inChunks(ids, (part) =>
        db
          .select({
            leg: predictionLegs,
            playerName: players.name,
          })
          .from(predictionLegs)
          .leftJoin(players, eq(players.id, predictionLegs.playerId))
          .where(inArray(predictionLegs.predictionId, part))
          .orderBy(predictionLegs.predictionId, predictionLegs.position),
      )
      const tickers = [
        ...new Set([
          ...all.map((p) => p.marketTicker),
          ...legs.map((l) => l.leg.marketTicker),
        ]),
      ]
      const gameIds = [
        ...new Set(legs.flatMap((l) => (l.leg.gameId ? [l.leg.gameId] : []))),
      ]
      const away = aliasedTable(teams, 'away')
      const home = aliasedTable(teams, 'home')
      const [marketRows, gameRows, history] = await Promise.all([
        inChunks(tickers, (part) =>
          db
            .select()
            .from(kalshiMarkets)
            .where(inArray(kalshiMarkets.ticker, part)),
        ),
        inChunks(gameIds, (part) =>
          db
            .select({ game: games, away, home })
            .from(games)
            .innerJoin(away, eq(away.id, games.awayTeamId))
            .innerJoin(home, eq(home.id, games.homeTeamId))
            .where(inArray(games.id, part)),
        ),
        inChunks(
          open.map((p) => p.marketTicker),
          (part) =>
            db
              .select()
              .from(kalshiPrices)
              .where(
                and(
                  inArray(kalshiPrices.ticker, part),
                  gte(
                    kalshiPrices.at,
                    new Date(Date.now() - HISTORY_MS)
                      .toISOString()
                      .slice(0, 16),
                  ),
                ),
              )
              .orderBy(kalshiPrices.at),
        ),
      ])
      const marketBy = new Map(marketRows.map((m) => [m.ticker, m]))
      const gameBy = new Map(
        gameRows.map((r) => [r.game.id, toGameSummary(r.game, r.away, r.home)]),
      )
      const boxBy = new Map(gameRows.map((r) => [r.game.id, r.game.box]))
      const yesChance = (ticker: string): number | null => {
        const m = marketBy.get(ticker)
        return m ? bookChance(m) : null
      }
      const forSide = (chance: number | null, side: 'yes' | 'no') =>
        chance === null ? null : side === 'yes' ? chance : 1 - chance

      return all.map((p): PredictionView => {
        const m = marketBy.get(p.marketTicker)
        // A Combo has no book: its chance (and cash-out) come from its Legs.
        const yes = predictionYesChance(
          p.kind,
          m,
          legs
            .filter((l) => l.leg.predictionId === p.id)
            .map(({ leg }) => ({
              side: leg.side,
              yesChance: yesChance(leg.marketTicker),
              result: marketBy.get(leg.marketTicker)?.result,
            })),
        )
        return {
          id: p.id,
          kind: p.kind,
          side: p.side,
          title: p.title,
          contracts: p.contracts,
          cost: p.cost,
          status: p.status,
          result: p.result,
          payout: p.payout,
          pnl: p.pnl,
          openedAt: p.openedAt,
          settledAt: p.settledAt,
          chance: p.status === 'open' ? forSide(yes, p.side) : null,
          entryChance: p.contracts > 0 ? p.cost / p.contracts : null,
          value:
            p.status === 'open'
              ? positionValue(p.kind, p.side, p.contracts, m, yes)
              : null,
          history: history
            .filter((h) => h.ticker === p.marketTicker)
            .map((h) => ({
              at: h.at,
              chance: p.side === 'yes' ? h.chance : 1 - h.chance,
            })),
          legs: legs
            .filter((l) => l.leg.predictionId === p.id)
            .map(({ leg, playerName }) => {
              const lm = marketBy.get(leg.marketTicker)
              const result = lm?.result
              const game = leg.gameId ? (gameBy.get(leg.gameId) ?? null) : null
              return {
                title: leg.title,
                side: leg.side,
                chance: forSide(yesChance(leg.marketTicker), leg.side),
                status:
                  result === 'yes' || result === 'no'
                    ? result === leg.side
                      ? 'won'
                      : 'lost'
                    : 'pending',
                game,
                playerId: leg.playerId,
                playerName,
                teamId: leg.teamId,
                progress: game
                  ? progressOf({
                      league: game.league,
                      eventTicker: leg.eventTicker,
                      title: leg.title,
                      floorStrike: lm?.floorStrike ?? null,
                      game,
                      box: boxBy.get(game.id) ?? null,
                      teamId: leg.teamId,
                      playerId: leg.playerId,
                    })
                  : null,
              }
            }),
        }
      })
    })
  },
)

/**
 * Every Prediction the Viewer has made, compactly, for their Record
 * (record.ts builds it on the device, for any range).
 */
export const getPredictionRecord = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<RecordEntry>> => {
    if (!(await sessionViewer())) return []
    return withViewer(async ({ db, viewerId }) => {
      const rows = await db
        .select()
        .from(predictions)
        .where(eq(predictions.viewerId, viewerId))
      if (rows.length === 0) return []
      const legs = await inChunks(
        rows.map((r) => r.id),
        (part) =>
          db
            .select({
              predictionId: predictionLegs.predictionId,
              eventTicker: predictionLegs.eventTicker,
              marketTicker: predictionLegs.marketTicker,
              side: predictionLegs.side,
              playerId: predictionLegs.playerId,
            })
            .from(predictionLegs)
            .where(inArray(predictionLegs.predictionId, part)),
      )
      const results = new Map(
        (
          await inChunks(
            [...new Set(legs.map((l) => l.marketTicker))],
            (part) =>
              db
                .select({
                  ticker: kalshiMarkets.ticker,
                  result: kalshiMarkets.result,
                })
                .from(kalshiMarkets)
                .where(inArray(kalshiMarkets.ticker, part)),
          )
        ).map((m) => [m.ticker, m.result]),
      )
      const legsOf = new Map<string, Array<RecordEntry['legs'][number]>>()
      for (const l of legs) {
        const r = results.get(l.marketTicker)
        const list = legsOf.get(l.predictionId) ?? []
        list.push({
          series: l.eventTicker.split('-')[0],
          playerProp: l.playerId !== null,
          status:
            r === 'yes' || r === 'no'
              ? r === l.side
                ? 'won'
                : 'lost'
              : 'pending',
        })
        legsOf.set(l.predictionId, list)
      }
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        cost: r.cost,
        status: r.status,
        result: r.result,
        pnl: r.pnl,
        madeAt: r.tradedAt ?? r.openedAt,
        settledAt: r.settledAt,
        entryChance: r.contracts > 0 ? r.cost / r.contracts : null,
        legs: legsOf.get(r.id) ?? [],
      }))
    })
  },
)
