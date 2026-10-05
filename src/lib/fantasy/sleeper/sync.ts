/**
 * Keeping Viewers' Sleeper leagues current: the same Matchups, feed and
 * Alerts as ESPN's (fantasy/sync.ts stores them). Server only: run by the
 * Scheduler, and when a Viewer connects or syncs.
 */

import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { storeMatchup } from '../sync'
import {
  SleeperError,
  league as fetchLeague,
  matchups as fetchMatchups,
  rosters as fetchRosters,
  leagueUsers,
  sleeperPlayer,
  sleeperState,
  userLeagues,
  weekProjections,
  weekStats,
} from './client'
import { myRoster, readSleeperMatchup } from './read'
import type {
  SleeperPlayerInfo,
  SleeperState,
  SleeperWeekEntry,
} from './client'
import type { WeekData } from './read'
import type { CloudflareEnv, Database } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import { fantasyLeagues, sleeperAccounts } from '@/lib/db/schema'

/** Look for new leagues this often. */
const DISCOVER_EVERY_MS = 24 * 3_600_000
/** Players the weekly feeds miss, read one by one, at most this many a sync. */
const LOOKUPS_PER_SYNC = 25

export function sleeperLeagueRowId(viewerId: string, leagueId: string) {
  return `${viewerId}~sleeper~${leagueId}`
}

/** Add the Viewer's NFL leagues this season (keeping their choices). */
export async function discover(
  db: Database,
  viewerId: string,
  userId: string,
  state: SleeperState,
): Promise<number> {
  const season = state.league_season ?? state.season
  const found = await userLeagues(userId, season)
  const now = new Date().toISOString()
  for (const l of found) {
    await db
      .insert(fantasyLeagues)
      .values({
        id: sleeperLeagueRowId(viewerId, l.league_id),
        viewerId,
        sport: 'football',
        provider: 'sleeper',
        leagueId: l.league_id,
        season: Number(season),
        name: l.name ?? `League ${l.league_id}`,
        updatedAt: now,
      })
      .onConflictDoNothing()
  }
  await db
    .update(sleeperAccounts)
    .set({ discoveredAt: now })
    .where(eq(sleeperAccounts.viewerId, viewerId))
  return found.length
}

/** This week's stats and projections, shared by every league in a sync. */
async function weekData(state: SleeperState): Promise<WeekData> {
  const season = state.season
  const [stats, projections] = await Promise.all([
    weekStats(season, state.week).catch((): Array<SleeperWeekEntry> => []),
    weekProjections(season, state.week).catch(
      (): Array<SleeperWeekEntry> => [],
    ),
  ])
  const info = new Map<string, SleeperPlayerInfo>()
  for (const e of [...projections, ...stats])
    if (e.player)
      info.set(e.player_id, { ...e.player, team: e.team ?? e.player.team })
  return {
    info,
    stats: new Map(stats.map((e) => [e.player_id, e.stats ?? {}])),
    projections: new Map(projections.map((e) => [e.player_id, e.stats ?? {}])),
  }
}

/** Read one league's Matchup this week and store it. */
export async function syncLeague(
  db: Database,
  row: typeof fantasyLeagues.$inferSelect,
  userId: string,
  state: SleeperState,
  data: WeekData,
): Promise<void> {
  const [league, rosterList, users, weekMatchups] = await Promise.all([
    fetchLeague(row.leagueId),
    fetchRosters(row.leagueId),
    leagueUsers(row.leagueId),
    fetchMatchups(row.leagueId, state.week).catch(() => []),
  ])
  const mine = myRoster(rosterList, userId)
  if (!mine) {
    await storeMatchup(db, row, null, {
      season: Number(state.season),
      teamId: null,
      lastError: 'Couldn’t find your team in this league.',
    })
    return
  }
  // Rostered players the weekly feeds don't carry (byes, injured reserve).
  const ids = [
    ...new Set(
      rosterList.flatMap((r) => [...(r.players ?? []), ...(r.starters ?? [])]),
    ),
  ].filter((id) => id !== '0' && !/^[A-Z]{2,3}$/.test(id) && !data.info.has(id))
  const info = new Map(data.info)
  for (const id of ids.slice(0, LOOKUPS_PER_SYNC)) {
    const p = await sleeperPlayer(id).catch(() => null)
    if (p) info.set(id, p)
  }
  const view = readSleeperMatchup({
    league,
    rosters: rosterList,
    users,
    matchups: weekMatchups,
    week: state.week,
    mine,
    data: { ...data, info },
  })
  await storeMatchup(db, row, view, {
    season: Number(state.season),
    teamId: mine.roster_id,
    lastError: null,
  })
}

/** Bring one Viewer's Sleeper leagues up to date. */
export async function syncAccount(
  env: Pick<CloudflareEnv, 'DB'>,
  viewerId: string,
): Promise<number> {
  const db = dbFromD1(env.DB)
  const account = await db
    .select()
    .from(sleeperAccounts)
    .where(eq(sleeperAccounts.viewerId, viewerId))
    .get()
  if (!account) return 0
  try {
    const state = await sleeperState()
    if (
      !account.discoveredAt ||
      Date.now() - Date.parse(account.discoveredAt) > DISCOVER_EVERY_MS
    ) {
      await discover(db, viewerId, account.userId, state).catch(
        (error: unknown) =>
          console.error('Sleeper discovery failed', { error: String(error) }),
      )
    }
    const leagues = await db
      .select()
      .from(fantasyLeagues)
      .where(
        and(
          eq(fantasyLeagues.viewerId, viewerId),
          eq(fantasyLeagues.provider, 'sleeper'),
          eq(fantasyLeagues.enabled, true),
        ),
      )
    const data = leagues.length > 0 ? await weekData(state) : null
    let synced = 0
    for (const row of leagues) {
      try {
        await syncLeague(db, row, account.userId, state, data!)
        synced++
      } catch (error) {
        await db
          .update(fantasyLeagues)
          .set({
            lastError:
              error instanceof SleeperError && error.status === 404
                ? 'Sleeper has no such league.'
                : String(error).slice(0, 200),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(fantasyLeagues.id, row.id))
      }
    }
    await db
      .update(sleeperAccounts)
      .set({
        status: 'ok',
        lastError: null,
        syncedAt: new Date().toISOString(),
      })
      .where(eq(sleeperAccounts.viewerId, viewerId))
    return synced
  } catch (error) {
    await db
      .update(sleeperAccounts)
      .set({
        status: 'error',
        lastError: String(error).slice(0, 200),
        syncedAt: new Date().toISOString(),
      })
      .where(eq(sleeperAccounts.viewerId, viewerId))
    throw error
  }
}

/** Accounts due a sync, oldest first. */
export async function accountsDue(
  env: Pick<CloudflareEnv, 'DB'>,
  everyMs: number,
  limit: number,
): Promise<Array<string>> {
  const cutoff = new Date(Date.now() - everyMs).toISOString()
  const rows = await dbFromD1(env.DB)
    .select({ viewerId: sleeperAccounts.viewerId })
    .from(sleeperAccounts)
    .where(
      or(
        isNull(sleeperAccounts.syncedAt),
        lt(sleeperAccounts.syncedAt, cutoff),
      ),
    )
    .orderBy(sleeperAccounts.syncedAt)
    .limit(limit)
  return rows.map((r) => r.viewerId)
}
