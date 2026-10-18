/**
 * Timeline reads over HTTP: the backlog a Viewer loads before the LiveHub
 * socket carries what happens next (docs/adr/0001, "Fan-out").
 */

import { createServerFn } from '@tanstack/react-start'
import { aliasedTable, and, desc, eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { BACKFILL_DAYS } from './days'
import { coverageWhere } from './coverage'
import { syncPastDay } from './pastDay'
import type { GameSummary, TeamRef, TimelineItem } from '@/lib/model/timeline'
import type { League } from '@/lib/model/types'
import { viewerMiddleware } from '@/lib/viewer/middleware'
import { teamColors } from '@/lib/brand/teamColors'
import { getCloudflareEnv, getDb } from '@/lib/db'
import { games, teams, timelineItems } from '@/lib/db/schema'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'
import { syncLeague } from '@/lib/live/schedule'
import { isRateLimited } from '@/lib/live/pacing'
import { ACTIVE_LEAGUES } from '@/lib/sources'
import { reportError } from '@/lib/ops/errors'
import { followsFromParam } from '@/lib/model/timeline'
import { toGameSummary, toTimelineItem } from '@/lib/live/rows'

const PAGE_SIZE = 100
const SPORTS_DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const timelineInput = z.object({
  sportsDay: SPORTS_DAY.optional(),
  follows: z.string().max(20_000),
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
  .middleware([viewerMiddleware])
  .validator((data: z.input<typeof timelineInput>) => timelineInput.parse(data))
  .handler(
    async ({ data, context: { db, viewerId } }): Promise<TimelinePage> => {
      const sportsDay = data.sportsDay ?? sportsDayOf(new Date())
      const covered = coverageWhere(followsFromParam(data.follows), {
        sportsDay,
        includeRoutine: data.includeRoutine,
        viewerId,
      })
      if (!covered) return { sportsDay, items: [], nextBefore: null }

      const t = timelineItems
      const away = aliasedTable(teams, 'away')
      const home = aliasedTable(teams, 'home')
      const rows = await db
        .select({
          item: t,
          ranks: { away: games.awayRank, home: games.homeRank },
          conferences: {
            away: games.awayConference,
            home: games.homeConference,
          },
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
        .innerJoin(games, eq(games.id, t.gameId))
        .innerJoin(away, eq(away.id, t.awayTeamId))
        .innerJoin(home, eq(home.id, t.homeTeamId))
        .where(
          and(
            eq(t.sportsDay, sportsDay),
            covered,
            data.before ? lt(t.occurredAt, data.before) : undefined,
          ),
        )
        .orderBy(desc(t.occurredAt), desc(t.sequence))
        .limit(PAGE_SIZE + 1)

      const page = rows.slice(0, PAGE_SIZE)
      return {
        sportsDay,
        items: page.map((r) =>
          toTimelineItem(
            r.item,
            {
              ...withColors(r.away),
              rank: r.ranks.away,
              conference: r.conferences.away,
            },
            {
              ...withColors(r.home),
              rank: r.ranks.home,
              conference: r.conferences.home,
            },
          ),
        ),
        nextBefore:
          rows.length > PAGE_SIZE
            ? (page.at(-1)?.item.occurredAt ?? null)
            : null,
      }
    },
  )

export const getGames = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
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
 * day's schedules so each finished Game is backfilled once. Idempotent; a
 * League found to have no Games that day isn't asked again for a while
 * (./pastDay). Returns how many Games the day has after the sync.
 */
export const ensureSportsDay = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator((data: { sportsDay: string }) =>
    z.object({ sportsDay: SPORTS_DAY }).parse(data),
  )
  .handler(async ({ data }): Promise<{ games: number; loading: boolean }> => {
    const now = new Date()
    const today = sportsDayOf(now)
    const oldest = shiftSportsDay(today, -BACKFILL_DAYS)
    if (data.sportsDay >= today || data.sportsDay < oldest) {
      return { games: 0, loading: false }
    }
    const env = getCloudflareEnv()
    const result = await syncPastDay(
      getDb(),
      data.sportsDay,
      now,
      ACTIVE_LEAGUES,
      (league) => syncLeague(env, league, data.sportsDay, now),
    )
    // A rate limit clears itself; the next open tries that League again.
    for (const failure of result.failures) {
      if (!isRateLimited(failure))
        await reportError(env, 'schedule', failure, {
          sportsDay: data.sportsDay,
        })
    }
    return { games: result.games, loading: result.synced && result.games > 0 }
  })
