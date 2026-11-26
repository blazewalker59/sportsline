/**
 * A Viewer's league's History (fantasy/history.ts), read when they look.
 * Each season is read from its provider once it's complete and kept
 * (fantasy_history), so a look reads only the season being played, and
 * that at most hourly. The seasons are the ones the provider names: ESPN
 * lists a league's earlier seasons; Sleeper links each season's league to
 * the one before. Nothing is guessed at by asking for years that may not
 * exist. Server only.
 */

import { eq } from 'drizzle-orm'
import { bracedSwid, seasonLeague } from './client'
import { readEspnSeason, summarizeHistory } from './history'
import { loadSession } from './sync'
import {
  league as fetchLeague,
  matchups as fetchMatchups,
  rosters as fetchRosters,
  leagueUsers,
  winnersBracket,
} from './sleeper/client'
import { readSleeperSeason } from './sleeper/history'
import type { HistorySeason, LeagueHistory } from './history'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { fantasyLeagues } from '@/lib/db/schema'
import { dbFromD1 } from '@/lib/db'
import { fantasyHistory, sleeperAccounts } from '@/lib/db/schema'

type LeagueRow = typeof fantasyLeagues.$inferSelect

/** The season being played is read again once it's this old. */
export const HISTORY_FRESH_MS = 60 * 60_000

/** Seasons read at most, newest first. */
export const HISTORY_SEASONS = 25

/** Seasons (or Sleeper weeks) read from the provider at once. */
const AT_ONCE = 4

/** A season to read: its year when known, and its league's provider id. */
interface Due {
  season: number | null
  ref: string
}

interface Reader {
  /** The Viewer's manager ids, when the provider says who they are. */
  mine: Array<string>
  read: (due: Due) => Promise<HistorySeason | null>
}

interface Kept {
  data: HistorySeason
  complete: boolean
  updatedAt: string
}

export async function readHistory(
  env: Pick<CloudflareEnv, 'DB' | 'ESPN_ENCRYPTION_KEY'>,
  viewerId: string,
  row: LeagueRow,
  now: number = Date.now(),
): Promise<LeagueHistory | null> {
  if (row.viewerId !== viewerId) return null
  const db = dbFromD1(env.DB)
  const reader =
    row.provider === 'sleeper'
      ? await sleeperReader(db, viewerId)
      : await espnReader(env, viewerId, row)
  const kept: Array<Kept> = await db
    .select({
      data: fantasyHistory.data,
      complete: fantasyHistory.complete,
      updatedAt: fantasyHistory.updatedAt,
    })
    .from(fantasyHistory)
    .where(eq(fantasyHistory.leagueRowId, row.id))
  const usable = (k: Kept | undefined) =>
    k && (k.complete || now - Date.parse(k.updatedAt) < HISTORY_FRESH_MS)
      ? k.data
      : null
  const find = (due: Due) =>
    kept.find((k) =>
      due.season !== null
        ? k.data.season === due.season
        : k.data.ref === due.ref,
    )

  const seasons: Array<HistorySeason> = []
  const missing: Array<number> = []
  const seen = new Set<string>()
  const keyOf = (due: Due) =>
    due.season !== null ? `season:${due.season}` : `ref:${due.ref}`
  const take = (s: HistorySeason) => {
    seasons.push(s)
    seen.add(`season:${s.season}`)
    seen.add(`ref:${s.ref}`)
  }

  // The current season: it names those before it. A failure here is the
  // whole read's.
  const first: Due = { season: row.season, ref: row.leagueId }
  const keptCurrent = usable(find(first))
  const current = keptCurrent ?? (await reader.read(first))
  if (!current) return summarizeHistory([], reader.mine)
  if (!keptCurrent) await keep(db, row.id, current, now)
  take(current)

  let queue: Array<Due> = current.earlier.filter((d) => !seen.has(keyOf(d)))
  while (queue.length > 0 && seasons.length < HISTORY_SEASONS) {
    const batch = queue.slice(
      0,
      Math.min(AT_ONCE, HISTORY_SEASONS - seasons.length),
    )
    queue = queue.slice(batch.length)
    const results = await Promise.all(
      batch.map(async (due) => {
        const hit = usable(find(due))
        if (hit) return hit
        try {
          const read = await reader.read(due)
          if (read) await keep(db, row.id, read, now)
          return read
        } catch {
          return null
        }
      }),
    )
    for (const [i, s] of results.entries()) {
      if (!s) {
        const due = batch[i]
        // A Sleeper link that failed: the season before the oldest read.
        missing.push(
          due.season ?? Math.min(...seasons.map((x) => x.season)) - 1,
        )
        continue
      }
      if (seen.has(`season:${s.season}`)) continue
      take(s)
      for (const d of s.earlier) {
        if (!seen.has(keyOf(d)) && !queue.some((q) => keyOf(q) === keyOf(d))) {
          queue.push(d)
        }
      }
    }
  }

  const mine =
    reader.mine.length > 0
      ? reader.mine
      : (current.teams.find((t) => t.teamId === row.teamId)?.managers ?? [])
  return summarizeHistory(seasons, mine, missing)
}

async function keep(
  db: Database,
  leagueRowId: string,
  data: HistorySeason,
  now: number,
): Promise<void> {
  const updatedAt = new Date(now).toISOString()
  await db
    .insert(fantasyHistory)
    .values({
      leagueRowId,
      season: data.season,
      data,
      complete: data.complete,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [fantasyHistory.leagueRowId, fantasyHistory.season],
      set: { data, complete: data.complete, updatedAt },
    })
}

/** ESPN: one read a season, with the Viewer's cookies (or none, if public). */
async function espnReader(
  env: Pick<CloudflareEnv, 'DB' | 'ESPN_ENCRYPTION_KEY'>,
  viewerId: string,
  row: LeagueRow,
): Promise<Reader> {
  const session = await loadSession(env, viewerId)
  return {
    mine: session ? [bracedSwid(session.swid)] : [],
    read: async (due) => {
      const season = due.season ?? row.season
      const wire = await seasonLeague(session, row.sport, season, row.leagueId)
      return readEspnSeason(wire, {
        season,
        leagueId: row.leagueId,
        past: season < row.season,
      })
    },
  }
}

/**
 * Sleeper: the season's league, rosters, managers and bracket, and each
 * scored week's matchups (public: no credentials).
 */
async function sleeperReader(db: Database, viewerId: string): Promise<Reader> {
  const account = await db
    .select({ userId: sleeperAccounts.userId })
    .from(sleeperAccounts)
    .where(eq(sleeperAccounts.viewerId, viewerId))
    .get()
  return {
    mine: account ? [account.userId] : [],
    read: async ({ ref }) => {
      const [league, rosters, users, winners] = await Promise.all([
        fetchLeague(ref),
        fetchRosters(ref),
        leagueUsers(ref),
        winnersBracket(ref).catch(() => []),
      ])
      const last = league.settings?.last_scored_leg ?? 0
      const weeks: Array<{
        week: number
        matchups: Awaited<ReturnType<typeof fetchMatchups>>
      }> = []
      for (let w = 1; w <= last; w += AT_ONCE) {
        const span = Array.from(
          { length: Math.min(AT_ONCE, last - w + 1) },
          (_, i) => w + i,
        )
        const got = await Promise.all(
          span.map((week) => fetchMatchups(ref, week)),
        )
        span.forEach((week, i) => weeks.push({ week, matchups: got[i] }))
      }
      return readSleeperSeason({
        league,
        rosters,
        users,
        weeks,
        winners: winners ?? [],
      })
    },
  }
}
