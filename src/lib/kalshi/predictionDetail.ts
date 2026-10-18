/**
 * One Prediction's whole life for its sheet, over HTTP: its Odds since it
 * was made and the Scoring Plays that moved them.
 */

import { createServerFn } from '@tanstack/react-start'
import { aliasedTable, and, eq, gte, inArray, lte } from 'drizzle-orm'
import { z } from 'zod'
import { inChunks } from './inChunks'
import { viewerMiddleware } from '@/lib/viewer/middleware'
import {
  kalshiPrices,
  predictionLegs,
  predictions,
  teams,
  timelineItems,
} from '@/lib/db/schema'
import { toTimelineItem } from '@/lib/live/rows'
import { teamRef } from '@/lib/players/cards'
import { scoringHeadline } from '@/lib/timeline/chat'

/** A Scoring Play in one of a Prediction's Games: what moved its odds. */
export interface PredictionMove {
  at: string
  /** "Touchdown", "Home run". */
  headline: string
  description: string
  /** The scoring team's abbreviation and color, when the play has a side. */
  team: string | null
  color: string | null
}

export interface PredictionDetail {
  /** The Viewer's side's chance (0–1) since the Prediction was made. */
  history: Array<{ at: string; chance: number }>
  /** What they paid per contract: the chance they got in at. */
  entryChance: number | null
  moves: Array<PredictionMove>
}

/** At most this many plays: enough to explain the swings, not every one. */
const MOVES_SHOWN = 60

/**
 * One Prediction's whole life for its sheet: the odds on the Viewer's side
 * since it was made (kalshi_prices, a point a minute while it's open) and
 * the Scoring Plays in its Games over that time.
 */
export const getPredictionDetail = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .validator((data: { id: string }) =>
    z.object({ id: z.string().min(1).max(400) }).parse(data),
  )
  .handler(
    async ({
      data,
      context: { db, viewerId },
    }): Promise<PredictionDetail | null> => {
      const p = await db
        .select()
        .from(predictions)
        .where(
          and(eq(predictions.id, data.id), eq(predictions.viewerId, viewerId)),
        )
        .get()
      if (!p) return null
      const from = p.tradedAt ?? p.openedAt
      const to = p.settledAt ?? new Date().toISOString()
      const [points, legs] = await Promise.all([
        db
          .select({ at: kalshiPrices.at, chance: kalshiPrices.chance })
          .from(kalshiPrices)
          .where(
            and(
              eq(kalshiPrices.ticker, p.marketTicker),
              gte(kalshiPrices.at, from.slice(0, 16)),
              lte(kalshiPrices.at, to.slice(0, 16)),
            ),
          )
          .orderBy(kalshiPrices.at),
        db
          .select({ gameId: predictionLegs.gameId })
          .from(predictionLegs)
          .where(eq(predictionLegs.predictionId, p.id)),
      ])
      const history = points
        // A Combo's market has no book: before Combos were priced from
        // their Legs, its points sat at the empty book's midpoint (50%).
        .filter((h) => p.kind !== 'combo' || h.chance !== 0.5)
        .map((h) => ({
          at: h.at,
          chance: p.side === 'yes' ? h.chance : 1 - h.chance,
        }))
      // A settled Prediction ends at its result (a closed market's last
      // quotes are no longer a chance).
      if ((p.result === 'won' || p.result === 'lost') && p.settledAt) {
        const at = p.settledAt.slice(0, 16)
        // One point a minute: the result replaces that minute's quote.
        if (history.at(-1)?.at === at) history.pop()
        history.push({ at, chance: p.result === 'won' ? 1 : 0 })
      }

      const gameIds = [
        ...new Set(legs.flatMap((l) => (l.gameId ? [l.gameId] : []))),
      ]
      const away = aliasedTable(teams, 'away')
      const home = aliasedTable(teams, 'home')
      const plays = await inChunks(gameIds, (part) =>
        db
          .select({ item: timelineItems, away, home })
          .from(timelineItems)
          .innerJoin(away, eq(away.id, timelineItems.awayTeamId))
          .innerJoin(home, eq(home.id, timelineItems.homeTeamId))
          .where(
            and(
              inArray(timelineItems.gameId, part),
              eq(timelineItems.kind, 'play'),
              eq(timelineItems.significance, 'scoring'),
              eq(timelineItems.status, 'active'),
              gte(timelineItems.occurredAt, from),
              lte(timelineItems.occurredAt, to),
            ),
          ),
      )
      const moves = plays
        .map(({ item, away: a, home: h }): PredictionMove => {
          const play = toTimelineItem(item, teamRef(a), teamRef(h))
          const team =
            play.side === 'away'
              ? play.awayTeam
              : play.side === 'home'
                ? play.homeTeam
                : null
          return {
            at: play.occurredAt,
            headline: scoringHeadline(play),
            description: play.description,
            team: team?.abbreviation ?? null,
            color: team?.colors?.primary ?? null,
          }
        })
        .sort((x, y) => x.at.localeCompare(y.at))
        .slice(-MOVES_SHOWN)
      return {
        history,
        entryChance: p.contracts > 0 ? p.cost / p.contracts : null,
        moves,
      }
    },
  )
