/**
 * Each Lineup Team's Game in the Matchup's window, for the Matchup sheet:
 * every Starter shows when they play, has played, or are playing (as
 * dreamteam does). Football's window is the NFL week, Tuesday to Monday
 * (Eastern), as ESPN's matchup is; basketball's and baseball's scoring is
 * daily, so today's Game, else the next. Stored Games come from D1; days
 * not stored yet from the Source's schedule.
 */

import { createServerFn } from '@tanstack/react-start'
import { aliasedTable, and, eq, gte, inArray, lte, or } from 'drizzle-orm'
import { z } from 'zod'
import type { GameSummary, TeamRef } from '@/lib/model/timeline'
import type { League, ScheduledGame } from '@/lib/model/types'
import { teamColors } from '@/lib/brand/teamColors'
import { getDb } from '@/lib/db'
import { games, sourceIds, teams } from '@/lib/db/schema'
import { toGameSummary } from '@/lib/live/rows'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'
import { LEAGUES } from '@/lib/model/types'
import { sourceFor } from '@/lib/sources'

/** Days of the window: football's NFL week, else today and a few ahead. */
export function matchupWindow(
  league: League,
  today: string,
): { from: string; to: string } {
  if (league === 'nfl') {
    // Sports Days are calendar days; the week turns over on Tuesday.
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
    const sinceTuesday = (weekday + 5) % 7
    const from = shiftSportsDay(today, -sinceTuesday)
    return { from, to: shiftSportsDay(from, 6) }
  }
  return { from: today, to: shiftSportsDay(today, 4) }
}

/**
 * One Game a Team: one live now first; then, in football, its Game this
 * week; elsewhere today's, else the next.
 */
export function pickGame(
  candidates: ReadonlyArray<GameSummary>,
): GameSummary | undefined {
  return (
    candidates.find((g) => g.status === 'live' || g.status === 'delayed') ??
    [...candidates].sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]
  )
}

export const getMatchupGames = createServerFn({ method: 'GET' })
  .validator((data: { league: string; teamIds: Array<string> }) =>
    z
      .object({
        league: z.enum(LEAGUES),
        teamIds: z.array(z.string().max(200)).max(40),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<Array<GameSummary>> => {
    const ids = [...new Set(data.teamIds)]
    if (ids.length === 0) return []
    const db = getDb()
    const today = sportsDayOf(new Date())
    const { from, to } = matchupWindow(data.league, today)
    const away = aliasedTable(teams, 'away')
    const home = aliasedTable(teams, 'home')
    const stored = (
      await db
        .select({ game: games, away, home })
        .from(games)
        .innerJoin(away, eq(away.id, games.awayTeamId))
        .innerJoin(home, eq(home.id, games.homeTeamId))
        .where(
          and(
            eq(games.league, data.league),
            gte(games.sportsDay, from),
            lte(games.sportsDay, to),
            or(inArray(games.awayTeamId, ids), inArray(games.homeTeamId, ids)),
          ),
        )
    ).map((r) => toGameSummary(r.game, r.away, r.home))

    const has = (g: GameSummary, id: string) =>
      g.awayTeam.id === id || g.homeTeam.id === id
    const missing = ids.filter((id) => !stored.some((g) => has(g, id)))
    const ahead: Array<GameSummary> = []
    if (missing.length > 0) {
      // Days not stored yet: read them from the Source.
      const adapter = sourceFor(data.league)
      const days: Array<string> = []
      for (let d = shiftSportsDay(today, 1); d <= to; d = shiftSportsDay(d, 1))
        days.push(d)
      const scheduled = (
        await Promise.all(
          days.map((d) =>
            adapter.schedule(d).catch((): Array<ScheduledGame> => []),
          ),
        )
      ).flat()
      const refs = await teamRefs(
        db,
        adapter.source,
        data.league,
        scheduled.flatMap((g) => [g.away.sourceId, g.home.sourceId]),
      )
      for (const g of scheduled) {
        const a = refs.get(g.away.sourceId)
        const h = refs.get(g.home.sourceId)
        if (!a || !h || !missing.some((id) => id === a.id || id === h.id))
          continue
        ahead.push({
          id: `src:${g.sourceGameId}`,
          league: g.league,
          sportsDay: g.sportsDay,
          status: g.status,
          startsAt: g.startsAt,
          awayTeam: a,
          homeTeam: h,
          score: g.score,
          situation: null,
        })
      }
    }
    const all = [...stored, ...ahead]
    return ids.flatMap((id) => pickGame(all.filter((g) => has(g, id))) ?? [])
  })

/** Our Teams for Source ids, as Game cards show them. */
async function teamRefs(
  db: ReturnType<typeof getDb>,
  source: string,
  league: League,
  sourceTeamIds: ReadonlyArray<string>,
): Promise<Map<string, TeamRef & { name: string }>> {
  const out = new Map<string, TeamRef & { name: string }>()
  const unique = [...new Set(sourceTeamIds)]
  for (let i = 0; i < unique.length; i += 80) {
    const rows = await db
      .select({ sourceId: sourceIds.sourceId, team: teams })
      .from(sourceIds)
      .innerJoin(teams, eq(teams.id, sourceIds.internalId))
      .where(
        and(
          eq(sourceIds.entity, 'team'),
          eq(sourceIds.source, source),
          inArray(sourceIds.sourceId, unique.slice(i, i + 80)),
          eq(teams.league, league),
        ),
      )
    for (const r of rows)
      out.set(r.sourceId, {
        id: r.team.id,
        abbreviation: r.team.abbreviation,
        logoUrl: r.team.logoUrl,
        name: r.team.name,
        colors: teamColors(r.team.league, r.team.name),
      })
  }
  return out
}
