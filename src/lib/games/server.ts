/**
 * Drill-in reads (CONTEXT.md, "Game Detail", "Play Detail"), all from D1:
 * LiveGame keeps each Game's row, box score and Plays current.
 */

import { createServerFn } from '@tanstack/react-start'
import { aliasedTable, and, asc, eq, lte } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from '@/lib/db'
import type { ItemRow } from '@/lib/live/rows'
import type { StatPlay } from '@/lib/leagues/mlb/stats'
import type {
  GameSummary,
  TimelineItem,
  TimelinePlayer,
} from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'
import { toGameSummary, toTimelineItem } from '@/lib/live/rows'
import { formatLine, mlbLinesAsOf } from '@/lib/leagues/mlb/stats'
import { games, teams, timelineItems } from '@/lib/db/schema'
import { getDb } from '@/lib/db'

export interface GameDetail {
  game: GameSummary
  box: GameBox | null
  /** Every Play and Game Milestone, in Game order. */
  items: Array<TimelineItem>
}

export interface PlayDetail {
  item: TimelineItem
  game: GameSummary
  /** Each Involved Player's in-Game stat lines as of this Play. */
  players: Array<{ player: TimelinePlayer; lines: Array<string> }>
}

async function loadGame(db: Database, gameId: string) {
  const away = aliasedTable(teams, 'away')
  const home = aliasedTable(teams, 'home')
  const row = await db
    .select({ game: games, away, home })
    .from(games)
    .innerJoin(away, eq(away.id, games.awayTeamId))
    .innerJoin(home, eq(home.id, games.homeTeamId))
    .where(eq(games.id, gameId))
    .get()
  if (!row) return null
  return {
    summary: toGameSummary(row.game, row.away, row.home),
    box: row.game.box ?? null,
  }
}

function asItem(row: ItemRow, game: GameSummary): TimelineItem {
  return toTimelineItem(
    row,
    { id: game.awayTeam.id, abbreviation: game.awayTeam.abbreviation },
    { id: game.homeTeam.id, abbreviation: game.homeTeam.abbreviation },
  )
}

const ID = z.string().min(1).max(200)

export const getGameDetail = createServerFn({ method: 'GET' })
  .validator((data: { gameId: string }) => z.object({ gameId: ID }).parse(data))
  .handler(async ({ data }): Promise<GameDetail | null> => {
    const db = getDb()
    const game = await loadGame(db, data.gameId)
    if (!game) return null
    const rows = await db
      .select()
      .from(timelineItems)
      .where(eq(timelineItems.gameId, data.gameId))
      .orderBy(asc(timelineItems.sequence))
    return {
      game: game.summary,
      box: game.box,
      items: rows.map((r) => asItem(r, game.summary)),
    }
  })

export const getPlayDetail = createServerFn({ method: 'GET' })
  .validator((data: { playId: string }) => z.object({ playId: ID }).parse(data))
  .handler(async ({ data }): Promise<PlayDetail | null> => {
    const db = getDb()
    const row = await db
      .select()
      .from(timelineItems)
      .where(eq(timelineItems.id, data.playId))
      .get()
    if (!row) return null
    const game = await loadGame(db, row.gameId)
    if (!game) return null
    const item = asItem(row, game.summary)

    let lines = new Map<string, Array<string>>()
    if (row.league === 'mlb' && row.kind === 'play') {
      const earlier = await db
        .select({
          sequence: timelineItems.sequence,
          playType: timelineItems.playType,
          segmentLabel: timelineItems.segmentLabel,
          awayScore: timelineItems.awayScore,
          homeScore: timelineItems.homeScore,
          players: timelineItems.players,
          detail: timelineItems.detail,
        })
        .from(timelineItems)
        .where(
          and(
            eq(timelineItems.gameId, row.gameId),
            eq(timelineItems.kind, 'play'),
            lte(timelineItems.sequence, row.sequence),
          ),
        )
      const statPlays: Array<StatPlay> = earlier.map((p) => ({
        sequence: p.sequence,
        playType: p.playType,
        segmentLabel: p.segmentLabel,
        score: { away: p.awayScore, home: p.homeScore },
        players: p.players,
        plateAppearance: isPlateAppearance(p.detail),
        detail: p.detail ?? null,
      }))
      lines = new Map(
        row.players.map((p) => [
          p.id,
          mlbLinesAsOf(statPlays, p.id, row.sequence).map(formatLine),
        ]),
      )
    }
    return {
      item,
      game: game.summary,
      players: row.players.map((player) => ({
        player,
        lines: lines.get(player.id) ?? [],
      })),
    }
  })

/** MLB plate appearances carry their Pitches; in-PA actions don't. */
function isPlateAppearance(detail: unknown): boolean {
  return Boolean(
    detail &&
    typeof detail === 'object' &&
    Array.isArray((detail as { pitches?: unknown }).pitches),
  )
}
