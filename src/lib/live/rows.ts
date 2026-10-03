/**
 * Conversions between the shared model, D1 rows and the TimelineItems
 * Viewers receive.
 */

import type { games, teams, timelineItems } from '@/lib/db/schema'
import type {
  GameSummary,
  TeamRef,
  TimelineItem,
  TimelinePlayer,
} from '@/lib/model/timeline'
import type { Json, League, SourceItem, SourcePlay } from '@/lib/model/types'
import { teamColors } from '@/lib/brand/teamColors'

export type ItemRow = typeof timelineItems.$inferSelect
type GameRow = typeof games.$inferSelect
type TeamRow = typeof teams.$inferSelect

/** The Game a LiveGame tracks, in Sportsline ids. */
export interface TrackedGame {
  gameId: string
  league: League
  sourceGameId: string
  sportsDay: string
  awayTeam: TeamRef
  homeTeam: TeamRef
}

export function itemRow(
  game: TrackedGame,
  id: string,
  item: SourceItem,
  playerIds: ReadonlyMap<string, string>,
): ItemRow {
  const players: Array<TimelinePlayer> =
    item.kind === 'play'
      ? item.involved.flatMap((p) => {
          const pid = playerIds.get(p.sourceId)
          return pid ? [{ id: pid, name: p.name, role: p.role }] : []
        })
      : []
  return {
    id,
    gameId: game.gameId,
    itemKey: item.key,
    league: game.league,
    sportsDay: game.sportsDay,
    awayTeamId: game.awayTeam.id,
    homeTeamId: game.homeTeam.id,
    kind: item.kind,
    side: item.kind === 'play' ? item.side : null,
    sequence: item.sequence,
    occurredAt: item.occurredAt,
    segmentLabel: item.segmentLabel,
    awayScore: item.score.away,
    homeScore: item.score.home,
    description: item.description,
    playType: item.kind === 'play' ? item.playType : null,
    significance: item.kind === 'play' ? item.significance : null,
    milestone: item.kind === 'milestone' ? item.milestone : null,
    status: 'active',
    revisedAt: null,
    overturnOf: null,
    players,
    detail:
      item.kind === 'play'
        ? withCredits(item.detail, item.credits, playerIds)
        : null,
  }
}

/** Store credits in the Play Detail payload, in Sportsline ids. */
function withCredits(
  detail: Json,
  credits: SourcePlay['credits'],
  playerIds: ReadonlyMap<string, string>,
): Json {
  const resolved = credits.flatMap((c) => {
    const id = playerIds.get(c.sourceId)
    return id ? [{ id, credit: c.credit }] : []
  })
  if (resolved.length === 0) return detail ?? null
  const base =
    detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {}
  return { ...base, credits: resolved }
}

export function toTimelineItem(
  row: ItemRow,
  away: TeamRef,
  home: TeamRef,
): TimelineItem {
  return {
    id: row.id,
    gameId: row.gameId,
    league: row.league,
    sportsDay: row.sportsDay,
    kind: row.kind,
    side: row.side ?? null,
    sequence: row.sequence,
    occurredAt: row.occurredAt,
    segmentLabel: row.segmentLabel,
    score: { away: row.awayScore, home: row.homeScore },
    awayTeam: away,
    homeTeam: home,
    description: row.description,
    playType: row.playType,
    significance: row.significance,
    milestone: row.milestone,
    status: row.status,
    revisedAt: row.revisedAt,
    overturnOf: row.overturnOf,
    players: row.players,
    detail: row.detail,
  }
}

export function toGameSummary(
  row: GameRow,
  away: TeamRow,
  home: TeamRow,
): GameSummary {
  return {
    id: row.id,
    league: row.league,
    sportsDay: row.sportsDay,
    status: row.status,
    startsAt: row.startsAt,
    awayTeam: { ...teamRef(away), rank: row.awayRank ?? null },
    homeTeam: { ...teamRef(home), rank: row.homeRank ?? null },
    score: { away: row.awayScore, home: row.homeScore },
    situation: row.situation ?? null,
  }
}

function teamRef(t: TeamRow): TeamRef & { name: string } {
  return {
    id: t.id,
    abbreviation: t.abbreviation,
    logoUrl: t.logoUrl ?? null,
    name: t.name,
    colors: teamColors(t.league, t.name),
  }
}
