/**
 * The same coverage rules as matchesFilter (src/lib/model/timeline.ts),
 * expressed in SQL for the Timeline backlog. Pure: builds the condition,
 * never runs it.
 *
 * D1 binds at most 100 values a statement, and a Scope can carry hundreds
 * of Teams, Players or Games (a long Follow list, a Viewer's Predictions),
 * so each id list is bound once as JSON and unpacked with json_each.
 */

import { and, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm'
import { QueryBuilder } from 'drizzle-orm/sqlite-core'
import type { SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { Follow } from '@/lib/model/timeline'
import {
  fantasyLeagues,
  fantasyPlayers,
  games,
  itemPlayers,
  timelineItems,
} from '@/lib/db/schema'

export interface CoverageOptions {
  /** The Sports Day the Timeline shows (Top 25 and Conference Games are per day). */
  sportsDay: string
  /** Show Routine Plays even for League, Game and college groups' Follows. */
  includeRoutine?: boolean
  /** The signed-in Viewer, whose own Starters a Fantasy Follow covers. */
  viewerId?: string | null
}

/** `column in (the JSON array's values)`: one bound value however many ids. */
export function inJson(column: SQLiteColumn, ids: ReadonlyArray<string>): SQL {
  return sql`${column} in (select value from json_each(${JSON.stringify(ids)}))`
}

/** Each id once: a param can repeat a Follow. */
const unique = <T>(values: Array<T>) => [...new Set(values)]

/** The condition for items these Follows cover, or null when none can be. */
export function coverageWhere(
  follows: ReadonlyArray<Follow>,
  { sportsDay, includeRoutine, viewerId }: CoverageOptions,
): SQL | null {
  const t = timelineItems
  const qb = new QueryBuilder()
  // Routine Plays only when asked for (Team and Player Follows take all).
  const notRoutine = includeRoutine
    ? undefined
    : or(ne(t.kind, 'play'), ne(t.significance, 'routine'))
  const covered: Array<SQL> = []
  const leagues = unique(
    follows.flatMap((f) => (f.kind === 'league' ? [f.league] : [])),
  )
  if (leagues.length > 0) {
    covered.push(and(inArray(t.league, leagues), notRoutine)!)
  }
  if (follows.some((f) => f.kind === 'top25')) {
    covered.push(
      and(
        eq(t.league, 'cfb'),
        inArray(
          t.gameId,
          qb
            .select({ id: games.id })
            .from(games)
            .where(
              and(
                eq(games.sportsDay, sportsDay),
                or(isNotNull(games.awayRank), isNotNull(games.homeRank)),
              ),
            ),
        ),
        notRoutine,
      )!,
    )
  }
  const conferences = unique(
    follows.flatMap((f) => (f.kind === 'conference' ? [f.conference] : [])),
  )
  if (conferences.length > 0) {
    covered.push(
      and(
        eq(t.league, 'cfb'),
        inArray(
          t.gameId,
          qb
            .select({ id: games.id })
            .from(games)
            .where(
              and(
                eq(games.sportsDay, sportsDay),
                or(
                  inArray(games.awayConference, conferences),
                  inArray(games.homeConference, conferences),
                ),
              ),
            ),
        ),
        notRoutine,
      )!,
    )
  }
  const gameIds = unique(
    follows.flatMap((f) => (f.kind === 'game' ? [f.gameId] : [])),
  )
  if (gameIds.length > 0) {
    covered.push(and(inJson(t.gameId, gameIds), notRoutine)!)
  }
  if (viewerId && follows.some((f) => f.kind === 'fantasy')) {
    // The Viewer's own Starters, either side of each Matchup, read here
    // rather than trusting (or binding) the list the client sent.
    covered.push(
      and(
        ne(t.kind, 'milestone'),
        inArray(
          t.id,
          qb
            .select({ id: itemPlayers.itemId })
            .from(itemPlayers)
            .where(
              inArray(
                itemPlayers.playerId,
                qb
                  .select({ id: fantasyPlayers.playerId })
                  .from(fantasyPlayers)
                  .innerJoin(
                    fantasyLeagues,
                    eq(fantasyLeagues.id, fantasyPlayers.leagueRowId),
                  )
                  .where(
                    and(
                      eq(fantasyLeagues.viewerId, viewerId),
                      eq(fantasyLeagues.enabled, true),
                      eq(fantasyPlayers.starter, true),
                    ),
                  ),
              ),
            ),
        ),
      )!,
    )
  }
  const teamIds = unique(
    follows.flatMap((f) => (f.kind === 'team' ? [f.teamId] : [])),
  )
  if (teamIds.length > 0) {
    covered.push(
      or(inJson(t.awayTeamId, teamIds), inJson(t.homeTeamId, teamIds))!,
    )
  }
  const playerIds = unique(
    follows.flatMap((f) => (f.kind === 'player' ? [f.playerId] : [])),
  )
  if (playerIds.length > 0) {
    covered.push(
      and(
        ne(t.kind, 'milestone'),
        inArray(
          t.id,
          qb
            .select({ id: itemPlayers.itemId })
            .from(itemPlayers)
            .where(inJson(itemPlayers.playerId, playerIds)),
        ),
      )!,
    )
  }
  return covered.length > 0 ? or(...covered)! : null
}
