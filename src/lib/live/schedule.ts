/**
 * The once-a-minute schedule sync (run by the Scheduler): for each
 * League with a Source, upsert today's Games and wake a LiveGame for every
 * Game that is live, about to start, or finished without being tracked.
 * A college League has far too many Games to read them all (CONTEXT.md,
 * "Opt-in"): only those someone opted into are stored and tracked, a
 * followed team's or one a Prediction was matched to, and with none the
 * Source isn't even asked.
 */

import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { chunk, resolve } from './identity'
import {
  RATE_LIMIT_GRACE_MS,
  WARMUP_MINUTES,
  isRateLimited,
  isTransient,
} from './pacing'
import type { BatchItem } from 'drizzle-orm/batch'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { Conference } from '@/lib/model/leagues'
import type { League, ScheduledGame } from '@/lib/model/types'
import { ACTIVE_LEAGUES, sourceFor } from '@/lib/sources'
import { sportsDayOf } from '@/lib/model/sportsDay'
import {
  follows,
  games,
  predictionLegs,
  predictions,
  sourceIds,
  teams,
} from '@/lib/db/schema'
import { isCollege } from '@/lib/model/types'
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
  for (const [i, r] of results.entries()) {
    const league = ACTIVE_LEAGUES[i]
    if (r.status === 'fulfilled') {
      failingSince.delete(league)
      continue
    }
    // A rate limit or a blip (a timeout, a 5xx) clears itself (the next
    // minute tries again): only one that lasts is worth reporting.
    if (isRateLimited(r.reason) || isTransient(r.reason)) {
      const since = failingSince.get(league) ?? now.getTime()
      failingSince.set(league, since)
      if (now.getTime() - since < RATE_LIMIT_GRACE_MS) continue
    }
    await reportError(env, 'schedule', r.reason, { sportsDay })
  }
}

/** Statuses whose Game row its LiveGame writes, not the schedule sync. */
const OWNED_BY_LIVE_GAME = ['live', 'delayed', 'final']

/** Between the first polls of Finals woken together to be backfilled. */
export const BACKFILL_SPACING_MS = 3_000

/**
 * When each League's schedule sync started failing with a rate limit or
 * a blip (this isolate).
 */
const failingSince = new Map<League, number>()

/**
 * One League's schedule for one Sports Day (a Team page opening an old
 * Game, a Prediction's Game being matched). `keep` narrows what's stored:
 * a Prediction stores only its own Game's candidates. Without one, a
 * college League keeps only what's opted into (collegeKeep). `optIn`
 * counts what's kept as opted into: a Viewer opening a college Game from
 * its Team page asked for that one.
 */
export async function syncLeague(
  env: CloudflareEnv,
  league: League,
  sportsDay: string,
  now: Date,
  {
    keep,
    optIn = false,
  }: { keep?: (g: ScheduledGame) => boolean; optIn?: boolean } = {},
): Promise<void> {
  const adapter = sourceFor(league)
  const db = dbFromD1(env.DB)
  const narrow =
    keep ??
    (isCollege(league)
      ? await collegeKeep(db, league, adapter.source, sportsDay)
      : undefined)
  // Nothing opted into: don't ask the Source at all.
  if (narrow === null) return
  const scheduled = (await adapter.schedule(sportsDay)).filter(
    (g) => g.sportsDay === sportsDay && (!narrow || narrow(g)),
  )
  if (scheduled.length === 0) return

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

  const stored = await storedGames(db, [...gameIds.values()])
  const storedLogos = await storedTeamLogos(db, [...new Set(teamIds.values())])

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
    const prior = stored.get(id)
    if (!prior) return [db.insert(games).values(row).onConflictDoNothing()]
    // Once a LiveGame owns a Game (live or later), it writes the row; and
    // an unchanged Game isn't rewritten every minute.
    if (OWNED_BY_LIVE_GAME.includes(prior.status)) return []
    const update = {
      startsAt: row.startsAt,
      status: row.status,
      awayRank: row.awayRank,
      homeRank: row.homeRank,
      awayConference: row.awayConference,
      homeConference: row.homeConference,
    }
    const changed = (Object.keys(update) as Array<keyof typeof update>).some(
      (k) => update[k] !== prior[k],
    )
    if (!changed) return []
    return [
      db
        .update(games)
        .set({ ...update, updatedAt: nowIso })
        .where(
          and(eq(games.id, id), notInArray(games.status, OWNED_BY_LIVE_GAME)),
        ),
    ]
  })
  // Keep each Team's logo current between nightly roster syncs, writing
  // only those that changed (resolve() created any new Team with its logo).
  const changedTeams = [
    ...new Map(
      scheduled.flatMap((g) => [g.away, g.home]).map((t) => [t.sourceId, t]),
    ).values(),
  ].filter((t) => {
    const id = teamIds.get(t.sourceId)!
    return storedLogos.has(id) && storedLogos.get(id) !== t.logoUrl
  })
  for (const part of chunk(changedTeams, 20)) {
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
          setWhere: sql`${teams.logoUrl} is not excluded.logo_url`,
        }),
    )
  }
  const [first, ...rest] = writes
  if (first) await db.batch([first, ...rest])

  // A college Game is tracked only when someone opted into it.
  const optedIn = !isCollege(league)
    ? null
    : optIn
      ? new Set(scheduled.map((g) => gameIds.get(g.sourceGameId)!))
      : await optedInGames(
          db,
          scheduled.map((g) => ({
            id: gameIds.get(g.sourceGameId)!,
            awayTeamId: teamIds.get(g.away.sourceId)!,
            homeTeamId: teamIds.get(g.home.sourceId)!,
          })),
        )
  // A past day can hold a hundred Finals to backfill: space their first
  // polls out rather than send every LiveGame to the Source at once.
  let backfills = 0
  const wakes = scheduled
    .filter((g) => !optedIn || optedIn.has(gameIds.get(g.sourceGameId)!))
    .filter((g) =>
      needsTracking(g, stored.get(gameIds.get(g.sourceGameId)!)?.status, now),
    )
    .map((g) => {
      const gameId = gameIds.get(g.sourceGameId)!
      const stub = env.LIVE_GAME.get(env.LIVE_GAME.idFromName(gameId))
      const delayMs =
        g.status === 'final' ? backfills++ * BACKFILL_SPACING_MS : 0
      const wake = stub.track(
        {
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
        },
        delayMs,
      )
      return { gameId, sourceGameId: g.sourceGameId, wake }
    })
  // One LiveGame that can't be woken (its storage timed out and it was
  // reset) is logged on its own; the rest still are, and the next
  // minute's sync tries it again.
  const results = await Promise.allSettled(wakes.map((w) => w.wake))
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') continue
    const { gameId, sourceGameId } = wakes[i]
    // Cloudflare resetting a LiveGame is logged, not pushed: the next
    // minute wakes it again.
    await reportError(
      env,
      'live-game-track',
      r.reason,
      { league, sportsDay, gameId, sourceGameId },
      { notify: !isTransient(r.reason) },
    )
  }
}

/**
 * Which of a college League's Games to store and track (CONTEXT.md,
 * "Opt-in"): one with a followed team, or one already stored for the day
 * (a Prediction matched it). Null with neither: nothing to ask the Source
 * for. Reads only.
 */
export async function collegeKeep(
  db: Database,
  league: League,
  source: string,
  sportsDay: string,
): Promise<((g: ScheduledGame) => boolean) | null> {
  const [followed, stored] = await Promise.all([
    db
      .selectDistinct({ sourceId: sourceIds.sourceId })
      .from(follows)
      .innerJoin(teams, eq(teams.id, follows.target))
      .innerJoin(
        sourceIds,
        and(
          eq(sourceIds.internalId, teams.id),
          eq(sourceIds.entity, 'team'),
          eq(sourceIds.source, source),
        ),
      )
      .where(and(eq(follows.kind, 'team'), eq(teams.league, league))),
    db
      .select({ sourceId: sourceIds.sourceId })
      .from(games)
      .innerJoin(
        sourceIds,
        and(
          eq(sourceIds.internalId, games.id),
          eq(sourceIds.entity, 'game'),
          eq(sourceIds.source, source),
        ),
      )
      .where(and(eq(games.league, league), eq(games.sportsDay, sportsDay))),
  ])
  if (followed.length === 0 && stored.length === 0) return null
  const teamIds = new Set(followed.map((r) => r.sourceId))
  const gameIds = new Set(stored.map((r) => r.sourceId))
  return (g) =>
    gameIds.has(g.sourceGameId) ||
    teamIds.has(g.away.sourceId) ||
    teamIds.has(g.home.sourceId)
}

/**
 * Which of these Games someone opted into (CONTEXT.md, "Opt-in"): an open
 * Prediction with a Leg on the Game, or a Follow on either team, by any
 * Viewer.
 */
export async function optedInGames(
  db: Database,
  scheduled: ReadonlyArray<{
    id: string
    awayTeamId: string
    homeTeamId: string
  }>,
): Promise<Set<string>> {
  const out = new Set<string>()
  const ids = scheduled.map((g) => g.id)
  for (const part of chunk(ids, 90)) {
    const rows = await db
      .selectDistinct({ gameId: predictionLegs.gameId })
      .from(predictionLegs)
      .innerJoin(predictions, eq(predictions.id, predictionLegs.predictionId))
      .where(
        and(
          inArray(predictionLegs.gameId, part),
          eq(predictions.status, 'open'),
        ),
      )
    for (const r of rows) if (r.gameId) out.add(r.gameId)
  }
  const teamIds = [
    ...new Set(scheduled.flatMap((g) => [g.awayTeamId, g.homeTeamId])),
  ]
  const followed = new Set<string>()
  for (const part of chunk(teamIds, 90)) {
    const rows = await db
      .selectDistinct({ teamId: follows.target })
      .from(follows)
      .where(and(eq(follows.kind, 'team'), inArray(follows.target, part)))
    for (const r of rows) followed.add(r.teamId)
  }
  for (const g of scheduled)
    if (followed.has(g.awayTeamId) || followed.has(g.homeTeamId)) out.add(g.id)
  return out
}

/** The schedule fields of the Games already stored, by id. */
async function storedGames(db: Database, ids: Array<string>) {
  const out = new Map<
    string,
    {
      status: string
      startsAt: string
      awayRank: number | null
      homeRank: number | null
      awayConference: Conference | null
      homeConference: Conference | null
    }
  >()
  for (const part of chunk(ids, 90)) {
    const rows = await db
      .select({
        id: games.id,
        status: games.status,
        startsAt: games.startsAt,
        awayRank: games.awayRank,
        homeRank: games.homeRank,
        awayConference: games.awayConference,
        homeConference: games.homeConference,
      })
      .from(games)
      .where(inArray(games.id, part))
    for (const { id, ...row } of rows) out.set(id, row)
  }
  return out
}

/** Each stored Team's logo, by id. */
async function storedTeamLogos(
  db: Database,
  ids: Array<string>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  for (const part of chunk(ids, 90)) {
    const rows = await db
      .select({ id: teams.id, logoUrl: teams.logoUrl })
      .from(teams)
      .where(inArray(teams.id, part))
    for (const r of rows) out.set(r.id, r.logoUrl)
  }
  return out
}
