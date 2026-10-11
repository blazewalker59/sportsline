/**
 * Matching Kalshi markets to our Games, Teams and Players (cached in
 * kalshi_events / kalshi_targets). Server only.
 */

import { aliasedTable, and, eq, inArray, like, or } from 'drizzle-orm'
import { target as fetchTarget, milestoneFor } from './client'
import {
  findGame,
  kalshiTeamKey,
  leagueOf,
  normalizePlayerName,
  teamMatches,
} from './match'
import type { KalshiAccount, KalshiMarket } from './client'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { League } from '@/lib/model/types'
import {
  games,
  kalshiEvents,
  kalshiTargets,
  players,
  teams,
} from '@/lib/db/schema'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'
import { syncLeague } from '@/lib/live/schedule'
import { reportError } from '@/lib/ops/errors'

/** Look again for a Game we couldn't match after this long. */
const RECHECK_MS = 30 * 60_000
/** Store a future Game's schedule this far ahead, to match it early. */
const LOOKAHEAD_DAYS = 10

async function targetName(
  account: KalshiAccount,
  db: Database,
  id: string,
): Promise<{ name: string; league: string | null } | null> {
  const cached = await db
    .select()
    .from(kalshiTargets)
    .where(eq(kalshiTargets.id, id))
    .get()
  if (cached) return cached
  const t = await fetchTarget(account, id)
  if (!t) return null
  const name = t.type?.endsWith('_player')
    ? [t.details?.first_name, t.details?.last_name].filter(Boolean).join(' ') ||
      (t.name ?? '')
    : kalshiTeamKey(t.name, t.details?.team_name)
  const row = {
    id,
    type: t.type ?? 'unknown',
    name,
    league: t.details?.league ?? null,
  }
  await db.insert(kalshiTargets).values(row).onConflictDoNothing()
  return row
}

/** Our Game for a Kalshi event, matching (and remembering) it if we can. */
export async function gameFor(
  env: CloudflareEnv,
  account: KalshiAccount,
  db: Database,
  eventTicker: string,
): Promise<{ gameId: string | null; league: League | null }> {
  const now = Date.now()
  let cached = await db
    .select()
    .from(kalshiEvents)
    .where(eq(kalshiEvents.eventTicker, eventTicker))
    .get()
  if (cached?.gameId) return { gameId: cached.gameId, league: cached.league }
  if (cached && now - Date.parse(cached.checkedAt) < RECHECK_MS) {
    return { gameId: null, league: cached.league }
  }
  if (!cached) {
    const ms = await milestoneFor(account, eventTicker)
    const [home, away] = await Promise.all([
      ms?.details?.home_team_id
        ? targetName(account, db, ms.details.home_team_id)
        : null,
      ms?.details?.away_team_id
        ? targetName(account, db, ms.details.away_team_id)
        : null,
    ])
    cached = {
      eventTicker,
      milestoneId: ms?.id ?? null,
      league: leagueOf(ms?.details?.league),
      startsAt: ms?.start_date ?? null,
      homeName: home?.name ?? null,
      awayName: away?.name ?? null,
      gameId: null,
      checkedAt: new Date(now).toISOString(),
    }
  }
  let gameId: string | null = null
  const { league, startsAt, homeName, awayName } = cached
  if (league && startsAt && homeName && awayName) {
    const day = sportsDayOf(new Date(startsAt))
    const find = async () => {
      const home = aliasedTable(teams, 'home')
      const away = aliasedTable(teams, 'away')
      const rows = await db
        .select({
          id: games.id,
          startsAt: games.startsAt,
          homeName: home.name,
          awayName: away.name,
        })
        .from(games)
        .innerJoin(home, eq(home.id, games.homeTeamId))
        .innerJoin(away, eq(away.id, games.awayTeamId))
        .where(
          and(
            eq(games.league, league),
            inArray(games.sportsDay, [
              shiftSportsDay(day, -1),
              day,
              shiftSportsDay(day, 1),
            ]),
          ),
        )
      return findGame(rows, { homeKey: homeName, awayKey: awayName, startsAt })
    }
    gameId = await find()
    const ahead = Date.parse(startsAt) - now
    if (!gameId && ahead < LOOKAHEAD_DAYS * 86_400_000) {
      // Not stored yet (a future day, or one never browsed): store that
      // day's schedule for the League, then look again.
      await syncLeague(env, league, day, new Date(now)).catch(
        (error: unknown) =>
          reportError(env, 'kalshi', error, {
            step: 'schedule',
            league,
            sportsDay: day,
          }),
      )
      gameId = await find()
    }
  }
  const row = { ...cached, gameId, checkedAt: new Date(now).toISOString() }
  await db
    .insert(kalshiEvents)
    .values(row)
    .onConflictDoUpdate({
      target: kalshiEvents.eventTicker,
      set: { gameId: row.gameId, checkedAt: row.checkedAt },
    })
  return { gameId, league }
}

/** Our Team or Player a leg's market is about, from its custom strike. */
export async function subjectFor(
  account: KalshiAccount,
  db: Database,
  m: KalshiMarket | undefined,
  league: League | null,
  gameId: string | null,
): Promise<{ teamId: string | null; playerId: string | null }> {
  const strike = m?.custom_strike ?? {}
  const playerTarget = Object.entries(strike).find(([k]) =>
    k.endsWith('_player'),
  )?.[1]
  const teamTarget = Object.entries(strike).find(([k]) =>
    k.endsWith('_team'),
  )?.[1]
  let playerId: string | null = null
  let teamId: string | null = null
  if (playerTarget && league) {
    const t = await targetName(account, db, playerTarget)
    if (t) {
      const want = normalizePlayerName(t.name)
      const last = t.name.trim().split(/\s+/).at(-1) ?? ''
      const rows = await db
        .select({ id: players.id, name: players.name })
        .from(players)
        .where(and(eq(players.league, league), endsWithWord(last)))
      playerId =
        rows.find((p) => normalizePlayerName(p.name) === want)?.id ?? null
    }
  }
  if (teamTarget && gameId) {
    const t = await targetName(account, db, teamTarget)
    const game = await db
      .select({ home: games.homeTeamId, away: games.awayTeamId })
      .from(games)
      .where(eq(games.id, gameId))
      .get()
    if (t && game) {
      const named = await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, [game.home, game.away]))
      teamId = named.find((x) => teamMatches(t.name, x.name))?.id ?? null
    }
  }
  return { teamId, playerId }
}

/** Players whose name has this word (narrows the exact name comparison). */
function endsWithWord(lastWord: string) {
  // SQLite LIKE is case-insensitive for ASCII.
  return or(eq(players.name, lastWord), like(players.name, `% ${lastWord}%`))
}
