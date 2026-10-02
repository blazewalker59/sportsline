/**
 * Timeline reads over HTTP: the backlog a Viewer loads before the LiveHub
 * socket carries what happens next (docs/adr/0001, "Fan-out").
 */

import { createServerFn } from '@tanstack/react-start'
import {
  aliasedTable,
  and,
  desc,
  eq,
  inArray,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { z } from 'zod'
import { BACKFILL_DAYS } from './days'
import type { SQL } from 'drizzle-orm'
import type { GameSummary, TeamRef, TimelineItem } from '@/lib/model/timeline'
import type { League } from '@/lib/model/types'
import { teamColors } from '@/lib/brand/teamColors'
import { getCloudflareEnv, getDb } from '@/lib/db'
import { games, itemPlayers, teams, timelineItems } from '@/lib/db/schema'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'
import { syncDay } from '@/lib/live/schedule'
import { followsFromParam } from '@/lib/model/timeline'
import { toGameSummary, toTimelineItem } from '@/lib/live/rows'

const PAGE_SIZE = 50
const SPORTS_DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const timelineInput = z.object({
  sportsDay: SPORTS_DAY.optional(),
  follows: z.string().max(4000),
  includeRoutine: z.boolean().optional(),
  /** Cursor: load items strictly older than this occurredAt. */
  before: z.string().optional(),
})

export interface TimelinePage {
  sportsDay: string
  items: Array<TimelineItem>
  /** Pass as `before` for the next page; null at the end. */
  nextBefore: string | null
}

export const getTimeline = createServerFn({ method: 'GET' })
  .validator((data: z.input<typeof timelineInput>) => timelineInput.parse(data))
  .handler(async ({ data }): Promise<TimelinePage> => {
    const db = getDb()
    const sportsDay = data.sportsDay ?? sportsDayOf(new Date())
    const follows = followsFromParam(data.follows)
    if (follows.length === 0) return { sportsDay, items: [], nextBefore: null }

    // The same coverage rules as matchesFilter (src/lib/model/timeline.ts),
    // expressed in SQL.
    const t = timelineItems
    const covered: Array<SQL> = []
    const leagues = follows.flatMap((f) =>
      f.kind === 'league' ? [f.league] : [],
    )
    const teamIds = follows.flatMap((f) =>
      f.kind === 'team' ? [f.teamId] : [],
    )
    const playerIds = follows.flatMap((f) =>
      f.kind === 'player' ? [f.playerId] : [],
    )
    if (leagues.length > 0) {
      const leagueMatch = inArray(t.league, leagues)
      covered.push(
        data.includeRoutine
          ? leagueMatch
          : and(
              leagueMatch,
              or(ne(t.kind, 'play'), ne(t.significance, 'routine')),
            )!,
      )
    }
    if (teamIds.length > 0) {
      covered.push(
        or(inArray(t.awayTeamId, teamIds), inArray(t.homeTeamId, teamIds))!,
      )
    }
    if (playerIds.length > 0) {
      covered.push(
        and(
          ne(t.kind, 'milestone'),
          inArray(
            t.id,
            db
              .select({ id: itemPlayers.itemId })
              .from(itemPlayers)
              .where(inArray(itemPlayers.playerId, playerIds)),
          ),
        )!,
      )
    }

    const away = aliasedTable(teams, 'away')
    const home = aliasedTable(teams, 'home')
    const rows = await db
      .select({
        item: t,
        away: {
          id: away.id,
          abbreviation: away.abbreviation,
          logoUrl: away.logoUrl,
          name: away.name,
          league: away.league,
        },
        home: {
          id: home.id,
          abbreviation: home.abbreviation,
          logoUrl: home.logoUrl,
          name: home.name,
          league: home.league,
        },
      })
      .from(t)
      .innerJoin(away, eq(away.id, t.awayTeamId))
      .innerJoin(home, eq(home.id, t.homeTeamId))
      .where(
        and(
          eq(t.sportsDay, sportsDay),
          or(...covered),
          data.before ? lt(t.occurredAt, data.before) : undefined,
        ),
      )
      .orderBy(desc(t.occurredAt), desc(t.sequence))
      .limit(PAGE_SIZE + 1)

    const page = rows.slice(0, PAGE_SIZE)
    return {
      sportsDay,
      items: page.map((r) =>
        toTimelineItem(r.item, withColors(r.away), withColors(r.home)),
      ),
      nextBefore:
        rows.length > PAGE_SIZE ? (page.at(-1)?.item.occurredAt ?? null) : null,
    }
  })

export const getGames = createServerFn({ method: 'GET' })
  .validator((data: { sportsDay?: string }) =>
    z.object({ sportsDay: SPORTS_DAY.optional() }).parse(data),
  )
  .handler(async ({ data }): Promise<Array<GameSummary>> => {
    const db = getDb()
    const sportsDay = data.sportsDay ?? sportsDayOf(new Date())
    const away = aliasedTable(teams, 'away')
    const home = aliasedTable(teams, 'home')
    const rows = await db
      .select({ game: games, away, home })
      .from(games)
      .innerJoin(away, eq(away.id, games.awayTeamId))
      .innerJoin(home, eq(home.id, games.homeTeamId))
      .where(eq(games.sportsDay, sportsDay))
      .orderBy(games.startsAt)
    return rows.map((r) => toGameSummary(r.game, r.away, r.home))
  })

function withColors(t: {
  id: string
  abbreviation: string
  logoUrl: string | null
  name: string
  league: League
}): TeamRef {
  return {
    id: t.id,
    abbreviation: t.abbreviation,
    logoUrl: t.logoUrl,
    colors: teamColors(t.league, t.name),
  }
}

/**
 * Make sure a past Sports Day has its Games: if none are stored, sync that
 * day's schedules so each finished Game is backfilled once. Idempotent;
 * returns how many Games the day has after the sync.
 */
export const ensureSportsDay = createServerFn({ method: 'POST' })
  .validator((data: { sportsDay: string }) =>
    z.object({ sportsDay: SPORTS_DAY }).parse(data),
  )
  .handler(async ({ data }): Promise<{ games: number; loading: boolean }> => {
    const today = sportsDayOf(new Date())
    const oldest = shiftSportsDay(today, -BACKFILL_DAYS)
    if (data.sportsDay >= today || data.sportsDay < oldest) {
      return { games: 0, loading: false }
    }
    const db = getDb()
    const existing = await db
      .select({ n: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.sportsDay, data.sportsDay))
      .get()
    if ((existing?.n ?? 0) > 0) return { games: existing!.n, loading: false }
    await syncDay(getCloudflareEnv(), data.sportsDay, new Date())
    const after = await db
      .select({ n: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.sportsDay, data.sportsDay))
      .get()
    return { games: after?.n ?? 0, loading: (after?.n ?? 0) > 0 }
  })
