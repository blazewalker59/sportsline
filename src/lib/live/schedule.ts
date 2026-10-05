/**
 * The once-a-minute schedule sync (run by the Scheduler): for each
 * League with a Source, upsert today's Games and wake a LiveGame for every
 * Game that is live, about to start, or finished without being tracked.
 */

import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { chunk, resolve } from './identity'
import { WARMUP_MINUTES } from './pacing'
import type { BatchItem } from 'drizzle-orm/batch'
import type { CloudflareEnv } from '@/lib/db'
import type { League, ScheduledGame } from '@/lib/model/types'
import { ACTIVE_LEAGUES, sourceFor } from '@/lib/sources'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { games, teams } from '@/lib/db/schema'
import { dbFromD1 } from '@/lib/db'
import { reportError } from '@/lib/ops/errors'

/** Should a LiveGame be polling this Game right now? */
export function needsTracking(
  game: Pick<ScheduledGame, 'status' | 'startsAt'>,
  storedStatus: string | undefined,
  now: Date,
): boolean {
  switch (game.status) {
    case 'live':
    case 'delayed':
      return true
    case 'final':
      // Finished before we ever recorded it as final: poll once to backfill.
      return storedStatus !== 'final'
    case 'postponed':
      return storedStatus !== 'postponed'
    case 'scheduled':
      return (
        Date.parse(game.startsAt) - now.getTime() <= WARMUP_MINUTES * 60_000
      )
  }
}

export async function syncSchedules(
  env: CloudflareEnv,
  now: Date,
): Promise<void> {
  await syncDay(env, sportsDayOf(now), now)
}

/**
 * Sync one Sports Day's schedules for every League: today's from the
 * Scheduler, a past day's when a Viewer opens it (finished Games are then
 * backfilled once by their LiveGames).
 */
export async function syncDay(
  env: CloudflareEnv,
  sportsDay: string,
  now: Date,
): Promise<void> {
  const results = await Promise.allSettled(
    ACTIVE_LEAGUES.map((league) => syncLeague(env, league, sportsDay, now)),
  )
  for (const r of results) {
    if (r.status === 'rejected')
      await reportError(env, 'schedule', r.reason, { sportsDay })
  }
}

/** One League's schedule for one Sports Day (a Team page opening an old Game). */
export async function syncLeague(
  env: CloudflareEnv,
  league: League,
  sportsDay: string,
  now: Date,
): Promise<void> {
  const adapter = sourceFor(league)
  const scheduled = (await adapter.schedule(sportsDay)).filter(
    (g) => g.sportsDay === sportsDay,
  )
  if (scheduled.length === 0) return
  const db = dbFromD1(env.DB)

  const teamIds = await resolve(
    db,
    'team',
    adapter.source,
    league,
    scheduled.flatMap((g) => [g.away, g.home]),
  )
  const gameIds = await resolve(
    db,
    'game',
    adapter.source,
    league,
    scheduled.map((g) => ({ sourceId: g.sourceGameId, name: g.sourceGameId })),
  )

  const ids = [...gameIds.values()]
  const stored = new Map(
    (
      await db
        .select({ id: games.id, status: games.status })
        .from(games)
        .where(inArray(games.id, ids))
    ).map((r) => [r.id, r.status]),
  )

  const nowIso = now.toISOString()
  const writes = scheduled.flatMap((g): Array<BatchItem<'sqlite'>> => {
    const id = gameIds.get(g.sourceGameId)!
    const row = {
      id,
      league,
      sportsDay: g.sportsDay,
      startsAt: g.startsAt,
      status: g.status,
      awayTeamId: teamIds.get(g.away.sourceId)!,
      homeTeamId: teamIds.get(g.home.sourceId)!,
      awayScore: g.score.away,
      homeScore: g.score.home,
      awayRank: g.away.rank ?? null,
      homeRank: g.home.rank ?? null,
      awayConference: g.away.conference ?? null,
      homeConference: g.home.conference ?? null,
      updatedAt: nowIso,
    }
    // Once a LiveGame owns a Game (live or later), it writes the row.
    return stored.has(id)
      ? [
          db
            .update(games)
            .set({
              startsAt: row.startsAt,
              status: row.status,
              awayRank: row.awayRank,
              homeRank: row.homeRank,
              awayConference: row.awayConference,
              homeConference: row.homeConference,
              updatedAt: nowIso,
            })
            .where(
              and(
                eq(games.id, id),
                notInArray(games.status, ['live', 'delayed', 'final']),
              ),
            ),
        ]
      : [db.insert(games).values(row).onConflictDoNothing()]
  })
  // Keep each Team's name and logo current between nightly roster syncs.
  const scheduledTeams = [
    ...new Map(
      scheduled.flatMap((g) => [g.away, g.home]).map((t) => [t.sourceId, t]),
    ).values(),
  ]
  for (const part of chunk(scheduledTeams, 20)) {
    writes.push(
      db
        .insert(teams)
        .values(
          part.map((t) => ({
            id: teamIds.get(t.sourceId)!,
            league,
            name: t.name,
            abbreviation: t.abbreviation,
            logoUrl: t.logoUrl,
          })),
        )
        .onConflictDoUpdate({
          target: teams.id,
          set: { logoUrl: sql`excluded.logo_url` },
        }),
    )
  }
  const [first, ...rest] = writes
  await db.batch([first, ...rest])

  const wakes = scheduled
    .filter((g) =>
      needsTracking(g, stored.get(gameIds.get(g.sourceGameId)!), now),
    )
    .map((g) => {
      const gameId = gameIds.get(g.sourceGameId)!
      const stub = env.LIVE_GAME.get(env.LIVE_GAME.idFromName(gameId))
      return stub.track({
        gameId,
        league,
        sourceGameId: g.sourceGameId,
        sportsDay: g.sportsDay,
        awayTeam: {
          id: teamIds.get(g.away.sourceId)!,
          abbreviation: g.away.abbreviation,
          logoUrl: g.away.logoUrl,
          name: g.away.name,
        },
        homeTeam: {
          id: teamIds.get(g.home.sourceId)!,
          abbreviation: g.home.abbreviation,
          logoUrl: g.home.logoUrl,
          name: g.home.name,
        },
      })
    })
  await Promise.all(wakes)
}
