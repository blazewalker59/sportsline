/**
 * Keeping Viewers' Sleeper leagues current: the same Matchups, feed and
 * Alerts as ESPN's (fantasy/sync.ts stores them). Server only: run by the
 * Scheduler, and when a Viewer connects or syncs.
 */

import { and, eq } from 'drizzle-orm'
import {
  attachMatchup,
  attachOurs,
  isOtherMatchup,
  keepLeague,
  storeMatchup,
} from '../sync'
import {
  SleeperError,
  league as fetchLeague,
  matchups as fetchMatchups,
  rosters as fetchRosters,
  transactions as fetchTransactions,
  leagueUsers,
  seasonStats,
  sleeperPlayer,
  sleeperState,
  userLeagues,
  weekProjections,
  weekStats,
} from './client'
import {
  myRoster,
  readSleeperActivity,
  readSleeperAvailable,
  readSleeperLeagueMatchups,
  readSleeperMatchup,
  readSleeperStandings,
  readSleeperTeamSides,
} from './read'
import type { AvailablePlayers } from '../freeAgents'
import type {
  SleeperPlayerInfo,
  SleeperState,
  SleeperWeekEntry,
} from './client'
import type { WeekData } from './read'
import type { LeagueActivity } from '../activity'
import type { MatchupView } from '../matchup'
import type { CloudflareEnv, Database } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import { fantasyLeagues, sleeperAccounts } from '@/lib/db/schema'
import { reportError } from '@/lib/ops/errors'

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

/**
 * A league this week, as its Matchups are read: the league, its rosters
 * and managers, the week's Matchups, and who its players are.
 */
async function readWeek(
  leagueId: string,
  state: SleeperState,
  data: WeekData,
): Promise<Omit<Parameters<typeof readSleeperMatchup>[0], 'mine'>> {
  const [league, rosterList, users, weekMatchups] = await Promise.all([
    fetchLeague(leagueId),
    fetchRosters(leagueId),
    leagueUsers(leagueId),
    fetchMatchups(leagueId, state.week).catch(() => []),
  ])
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
  return {
    league,
    rosters: rosterList,
    users,
    matchups: weekMatchups,
    week: state.week,
    data: { ...data, info },
  }
}

/** Read one league's Matchup this week and store it. */
async function syncLeague(
  db: Database,
  row: typeof fantasyLeagues.$inferSelect,
  userId: string,
  state: SleeperState,
  data: WeekData,
): Promise<void> {
  const week = await readWeek(row.leagueId, state, data)
  const mine = myRoster(week.rosters, userId)
  const standings = readSleeperStandings({
    ...week,
    mine: mine?.roster_id ?? null,
  })
  const kept = await keepLeague(db, row, {
    scoringPeriod: week.week,
    sides: readSleeperTeamSides(week),
    mine: mine?.roster_id ?? null,
    categories: null,
  })
  if (!mine) {
    await storeMatchup(db, row, null, {
      season: Number(state.season),
      teamId: null,
      lastError: 'Couldn’t find your team in this league.',
      standings,
      ...kept,
    })
    return
  }
  const view = readSleeperMatchup({ ...week, mine })
  view.others = readSleeperLeagueMatchups(week, mine.roster_id)
  await storeMatchup(db, row, view, {
    season: Number(state.season),
    teamId: mine.roster_id,
    lastError: null,
    standings,
    ...kept,
  })
}

/**
 * Another Matchup in a Viewer's Sleeper league, read in full now and not
 * stored: roster `teamId` on the left, as the league's scoreboard
 * (`others`) has it. Null when that isn't one of its Matchups.
 */
export async function readLeagueMatchup(
  db: Database,
  row: typeof fantasyLeagues.$inferSelect,
  teamId: number,
): Promise<MatchupView | null> {
  if (row.provider !== 'sleeper') return null
  if (!row.matchup || !isOtherMatchup(row.matchup, teamId)) return null
  const state = await sleeperState()
  const week = await readWeek(row.leagueId, state, await weekData(state))
  const roster = week.rosters.find((r) => r.roster_id === teamId)
  if (!roster) return null
  const view = readSleeperMatchup({ ...week, mine: roster })
  await attachMatchup(db, row, view)
  return view
}

/**
 * A Sleeper league's Activity, read now and not stored: this week's and
 * last week's moves, each Player named from Sleeper's weekly feed (or
 * looked up), matched to ours.
 */
export async function readActivity(
  db: Database,
  row: typeof fantasyLeagues.$inferSelect,
): Promise<LeagueActivity | null> {
  if (row.provider !== 'sleeper') return null
  const state = await sleeperState()
  const weeks = [
    ...new Set([state.week, state.week - 1].map((w) => Math.max(w, 1))),
  ]
  const [txs, rosterList, users, projections] = await Promise.all([
    Promise.all(
      weeks.map((w) => fetchTransactions(row.leagueId, w).catch(() => [])),
    ).then((all) => all.flat()),
    fetchRosters(row.leagueId),
    leagueUsers(row.leagueId),
    weekProjections(state.season, state.week).catch(
      (): Array<SleeperWeekEntry> => [],
    ),
  ])
  const info = new Map<string, SleeperPlayerInfo>()
  for (const e of projections)
    if (e.player)
      info.set(e.player_id, { ...e.player, team: e.team ?? e.player.team })
  const unknown = [
    ...new Set(
      txs.flatMap((t) => [
        ...Object.keys(t.adds ?? {}),
        ...Object.keys(t.drops ?? {}),
      ]),
    ),
  ].filter((id) => !/^[A-Z]{2,3}$/.test(id) && !info.has(id))
  for (const id of unknown.slice(0, LOOKUPS_PER_SYNC)) {
    const p = await sleeperPlayer(id).catch(() => null)
    if (p) info.set(id, p)
  }
  const activity = readSleeperActivity({
    transactions: txs,
    rosters: rosterList,
    users,
    info,
  })
  await attachOurs(
    db,
    row,
    activity.entries.flatMap((e) => e.items.map((i) => i.player)),
  )
  return activity
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
      // A failed attempt still counts for the day (not retried every sync).
      await discover(db, viewerId, account.userId, state).catch(
        async (error: unknown) => {
          await reportError(env, 'sleeper', error, {
            viewerId,
            step: 'discovery',
          })
          await db
            .update(sleeperAccounts)
            .set({ discoveredAt: new Date().toISOString() })
            .where(eq(sleeperAccounts.viewerId, viewerId))
        },
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

/**
 * A Sleeper league's Available players, read now (never stored), matched
 * to ours for their Teams and headshots.
 */
export async function readAvailable(
  db: Database,
  row: typeof fantasyLeagues.$inferSelect,
): Promise<AvailablePlayers | null> {
  if (row.provider !== 'sleeper') return null
  const state = await sleeperState()
  const [league, rosterList, projections, season] = await Promise.all([
    fetchLeague(row.leagueId),
    fetchRosters(row.leagueId),
    weekProjections(state.season, Math.max(state.week, 1)),
    // Without the season, the list still reads by projection.
    seasonStats(state.season).catch((): Array<SleeperWeekEntry> => []),
  ])
  const available = readSleeperAvailable({
    league,
    rosters: rosterList,
    projections,
    season,
  })
  await attachOurs(db, row, available.players)
  return available
}
