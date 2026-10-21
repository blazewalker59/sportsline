/**
 * A football points league's What-if standings (fantasy/whatIf.ts), read
 * when the Viewer looks: each finished week is read from its provider
 * once it's final and kept (fantasy_what_if), so a look reads only the
 * weeks not yet kept. Server only.
 */

import { and, eq } from 'drizzle-orm'
import { leagueViews } from './client'
import { readWhatIfWeek } from './matchup'
import {
  league as fetchLeague,
  matchups as fetchMatchups,
  rosters as fetchRosters,
  leagueUsers,
  sleeperPlayer,
  sleeperState,
  weekProjections,
} from './sleeper/client'
import { readSleeperWhatIfWeek } from './sleeper/read'
import { loadSession } from './sync'
import { analyzeMatchup, summarizeWhatIf } from './whatIf'
import type { SleeperPlayerInfo } from './sleeper/client'
import type { WhatIfMatchup, WhatIfMatchupInput, WhatIfRow } from './whatIf'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { fantasyLeagues } from '@/lib/db/schema'
import { dbFromD1 } from '@/lib/db'
import { fantasyWhatIf } from '@/lib/db/schema'

export interface LeagueWhatIf {
  rows: Array<WhatIfRow>
  /** The finished weeks counted. */
  weeks: number
}

/** Weeks read from the provider at once. */
const AT_ONCE = 3

/** Players a Sleeper read looks up by id, at most. */
const LOOKUPS = 25

/** Only a football points league has What-if standings. */
export function hasWhatIf(row: typeof fantasyLeagues.$inferSelect): boolean {
  return row.sport === 'football' && !row.matchup?.categories
}

type Week = { slots: Array<string>; matchups: Array<WhatIfMatchupInput> } | null

export async function readWhatIf(
  env: Pick<CloudflareEnv, 'DB' | 'ESPN_ENCRYPTION_KEY'>,
  viewerId: string,
  row: typeof fantasyLeagues.$inferSelect,
): Promise<LeagueWhatIf | null> {
  if (row.viewerId !== viewerId || !hasWhatIf(row)) return null
  const db = dbFromD1(env.DB)
  const reader =
    row.provider === 'sleeper'
      ? await sleeperWeeks(row)
      : await espnWeeks(env, viewerId, row)
  if (!reader) return null
  const { current, read } = reader
  const kept = await db
    .select()
    .from(fantasyWhatIf)
    .where(
      and(
        eq(fantasyWhatIf.leagueRowId, row.id),
        eq(fantasyWhatIf.season, row.season),
      ),
    )
  const byWeek = new Map(kept.map((k) => [k.week, k]))
  const finished = Array.from(
    { length: Math.max(0, current - 1) },
    (_, i) => i + 1,
  )
  const due = finished.filter((w) => !byWeek.get(w)?.final)
  for (let i = 0; i < due.length; i += AT_ONCE) {
    const weeks = due.slice(i, i + AT_ONCE)
    const results = await Promise.all(weeks.map((w) => read(w)))
    for (const [j, week] of weeks.entries()) {
      const got = results[j]
      const matchups = got
        ? got.matchups.map((m) => analyzeMatchup(m, got.slots))
        : []
      // Two weeks back, stat corrections are in.
      const final = week <= current - 2
      await keep(db, row, week, matchups, final)
      byWeek.set(week, {
        leagueRowId: row.id,
        season: row.season,
        week,
        matchups,
        final,
        updatedAt: '',
      })
    }
  }
  const matchups = finished.flatMap((w) => byWeek.get(w)?.matchups ?? [])
  return {
    rows: summarizeWhatIf(matchups),
    weeks: finished.filter((w) => (byWeek.get(w)?.matchups.length ?? 0) > 0)
      .length,
  }
}

async function keep(
  db: Database,
  row: typeof fantasyLeagues.$inferSelect,
  week: number,
  matchups: Array<WhatIfMatchup>,
  final: boolean,
): Promise<void> {
  const updatedAt = new Date().toISOString()
  await db
    .insert(fantasyWhatIf)
    .values({
      leagueRowId: row.id,
      season: row.season,
      week,
      matchups,
      final,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [
        fantasyWhatIf.leagueRowId,
        fantasyWhatIf.season,
        fantasyWhatIf.week,
      ],
      set: { matchups, final, updatedAt },
    })
}

/** ESPN: the league as of each week (its scoring period). */
async function espnWeeks(
  env: Pick<CloudflareEnv, 'DB' | 'ESPN_ENCRYPTION_KEY'>,
  viewerId: string,
  row: typeof fantasyLeagues.$inferSelect,
): Promise<{ current: number; read: (week: number) => Promise<Week> } | null> {
  const current = row.matchup?.matchupPeriod
  if (!current) return null
  // A public league reads without cookies.
  const session = await loadSession(env, viewerId)
  return {
    current,
    read: async (week) =>
      readWhatIfWeek(
        row.sport,
        await leagueViews(session, row.sport, row.season, row.leagueId, week),
        week,
      ),
  }
}

/** Sleeper: the league, its rosters and managers, and each week's matchups. */
async function sleeperWeeks(
  row: typeof fantasyLeagues.$inferSelect,
): Promise<{ current: number; read: (week: number) => Promise<Week> }> {
  const state = await sleeperState()
  const [league, rosters, users, projections] = await Promise.all([
    fetchLeague(row.leagueId),
    fetchRosters(row.leagueId),
    leagueUsers(row.leagueId),
    weekProjections(state.season, state.week).catch(() => []),
  ])
  const info = new Map<string, SleeperPlayerInfo>()
  for (const e of projections) if (e.player) info.set(e.player_id, e.player)
  let lookups = 0
  return {
    current: state.week,
    read: async (week) => {
      const matchups = await fetchMatchups(row.leagueId, week)
      // Positions decide who could have started where.
      const unknown = [
        ...new Set(matchups.flatMap((m) => m.players ?? [])),
      ].filter((id) => !/^[A-Z]{2,3}$/.test(id) && !info.has(id))
      for (const id of unknown) {
        if (lookups >= LOOKUPS) break
        lookups++
        const p = await sleeperPlayer(id).catch(() => null)
        if (p) info.set(id, p)
      }
      return readSleeperWhatIfWeek({
        league,
        rosters,
        users,
        matchups,
        info,
        week,
      })
    },
  }
}
