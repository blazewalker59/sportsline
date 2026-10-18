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
import type { League, ScheduledGame, SourceTeam } from '@/lib/model/types'
import { viewerMiddleware } from '@/lib/viewer/middleware'
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
 * A Game belongs to this window when its Sports Day does, or when the
 * kickoff's Sports Day does. Monday night is 00:15 UTC Tuesday; a row
 * stored on that UTC date still counts. A Tuesday afternoon game does not.
 */
export function countsInMatchupWindow(
  game: { sportsDay: string; startsAt: string },
  window: { from: string; to: string },
): boolean {
  if (game.sportsDay >= window.from && game.sportsDay <= window.to) return true
  const day = sportsDayOf(new Date(game.startsAt))
  return day >= window.from && day <= window.to
}

/**
 * Sports Days to read from the Source for a football week: the whole
 * window, plus the next calendar day. That extra day is the UTC date of
 * a Monday night kickoff, and a Saturday game the scheduler missed is
 * still this week.
 */
export function sourceDays(window: {
  from: string
  to: string
}): Array<string> {
  const last = shiftSportsDay(window.to, 1)
  const days: Array<string> = []
  for (let d = window.from; d <= last; d = shiftSportsDay(d, 1)) days.push(d)
  return days
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
  .middleware([viewerMiddleware])
  .validator(
    (data: {
      league: string
      teamIds: Array<string>
      abbrevs?: Array<string>
    }) =>
      z
        .object({
          league: z.enum(LEAGUES),
          teamIds: z.array(z.string().max(200)).max(80),
          abbrevs: z.array(z.string().max(8)).max(80).optional(),
        })
        .parse(data),
  )
  .handler(async ({ data }): Promise<Array<GameSummary>> => {
    const ids = [...new Set(data.teamIds)]
    const abbrevs = [
      ...new Set((data.abbrevs ?? []).map((a) => a.toUpperCase())),
    ]
    if (ids.length === 0 && abbrevs.length === 0) return []
    const db = getDb()
    const today = sportsDayOf(new Date())
    const window = matchupWindow(data.league, today)
    const football = data.league === 'nfl'
    // Monday night's UTC date is the day after the window's Monday.
    const through = football ? shiftSportsDay(window.to, 1) : window.to
    const away = aliasedTable(teams, 'away')
    const home = aliasedTable(teams, 'home')
    const inWindow = and(
      eq(games.league, data.league),
      gte(games.sportsDay, window.from),
      lte(games.sportsDay, through),
    )
    const load = (teamWhere: ReturnType<typeof or>) =>
      db
        .select({ game: games, away, home })
        .from(games)
        .innerJoin(away, eq(away.id, games.awayTeamId))
        .innerJoin(home, eq(home.id, games.homeTeamId))
        .where(and(inWindow, teamWhere))
    const loaded = [
      ...(ids.length > 0
        ? await load(
            or(inArray(games.awayTeamId, ids), inArray(games.homeTeamId, ids)),
          )
        : []),
      ...(abbrevs.length > 0
        ? await load(
            or(
              inArray(away.abbreviation, abbrevs),
              inArray(home.abbreviation, abbrevs),
            ),
          )
        : []),
    ]
    const seenGame = new Set<string>()
    const stored = loaded.flatMap((r) => {
      if (seenGame.has(r.game.id)) return []
      seenGame.add(r.game.id)
      const summary = toGameSummary(r.game, r.away, r.home)
      return countsInMatchupWindow(summary, window) ? [summary] : []
    })

    const hasId = (g: GameSummary, id: string) =>
      g.awayTeam.id === id || g.homeTeam.id === id
    const hasAbbrev = (g: GameSummary, abbr: string) =>
      g.awayTeam.abbreviation.toUpperCase() === abbr ||
      g.homeTeam.abbreviation.toUpperCase() === abbr
    const missingIds = ids.filter((id) => !stored.some((g) => hasId(g, id)))
    const missingAbbrevs = abbrevs.filter(
      (abbr) => !stored.some((g) => hasAbbrev(g, abbr)),
    )
    const ahead: Array<GameSummary> = []
    if (missingIds.length > 0 || missingAbbrevs.length > 0) {
      // Days not stored yet: read them from the Source.
      const adapter = sourceFor(data.league)
      const days: Array<string> = []
      if (football) days.push(...sourceDays(window))
      else
        for (
          let d = shiftSportsDay(today, 1);
          d <= window.to;
          d = shiftSportsDay(d, 1)
        )
          days.push(d)
      const raw = (
        await Promise.all(
          days.map((d) =>
            adapter.schedule(d).catch((): Array<ScheduledGame> => []),
          ),
        )
      ).flat()
      const seenSource = new Set<string>()
      const scheduled = raw.filter((g) => {
        if (seenSource.has(g.sourceGameId)) return false
        seenSource.add(g.sourceGameId)
        return !football || countsInMatchupWindow(g, window)
      })
      const refs = await resolveSides(
        db,
        adapter.source,
        data.league,
        scheduled.flatMap((g) => [g.away, g.home]),
      )
      for (const g of scheduled) {
        const a = refs.get(g.away.sourceId)
        const h = refs.get(g.home.sourceId)
        if (!a || !h) continue
        const wanted =
          missingIds.some((id) => id === a.id || id === h.id) ||
          missingAbbrevs.some(
            (abbr) =>
              abbr === a.abbreviation.toUpperCase() ||
              abbr === h.abbreviation.toUpperCase(),
          )
        if (!wanted) continue
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
    const picked = new Map<string, GameSummary>()
    for (const id of ids) {
      const g = pickGame(all.filter((game) => hasId(game, id)))
      if (g) picked.set(g.id, g)
    }
    for (const abbr of abbrevs) {
      const g = pickGame(all.filter((game) => hasAbbrev(game, abbr)))
      if (g) picked.set(g.id, g)
    }
    return [...picked.values()]
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

/**
 * A scheduled side as a card shows it. Prefer the stored Team (Source id,
 * else abbreviation). Otherwise a stand-in from the Source, so a missing
 * row cannot drop the Game.
 */
async function resolveSides(
  db: ReturnType<typeof getDb>,
  source: string,
  league: League,
  sides: ReadonlyArray<SourceTeam>,
): Promise<Map<string, TeamRef & { name: string }>> {
  const out = await teamRefs(
    db,
    source,
    league,
    sides.map((s) => s.sourceId),
  )
  const missing = sides.filter((s) => !out.has(s.sourceId))
  const abbrevs = [...new Set(missing.map((s) => s.abbreviation))]
  if (abbrevs.length > 0) {
    const rows = await db
      .select()
      .from(teams)
      .where(
        and(eq(teams.league, league), inArray(teams.abbreviation, abbrevs)),
      )
    for (const s of missing) {
      if (out.has(s.sourceId)) continue
      const row = rows.find((r) => r.abbreviation === s.abbreviation)
      if (!row) continue
      out.set(s.sourceId, {
        id: row.id,
        abbreviation: row.abbreviation,
        logoUrl: row.logoUrl,
        name: row.name,
        colors: teamColors(row.league, row.name),
      })
    }
  }
  for (const s of sides) {
    if (out.has(s.sourceId)) continue
    out.set(s.sourceId, {
      id: `src:${s.sourceId}`,
      abbreviation: s.abbreviation,
      logoUrl: s.logoUrl,
      name: s.name,
      colors: teamColors(league, s.name),
    })
  }
  return out
}
