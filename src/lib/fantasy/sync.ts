/**
 * Keeping Viewers' Fantasy leagues current (CONTEXT.md, "Matchup"). Server
 * only: run by the Scheduler, and when a Viewer connects or adds a league.
 */

import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { EspnError, fanProfile, leagueViews } from './client'
import { discoverLeagues } from './discovery'
import { myTeamId, readMatchup } from './matchup'
import { SPORTS, seasonOf } from './sports'
import type { EspnSession } from './client'
import type { MatchupView } from './matchup'
import type { FantasySport } from './sports'
import type { CloudflareEnv, Database } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import {
  espnAccounts,
  fantasyLeagues,
  fantasyPlayers,
  players,
  sourceIds,
  teams,
} from '@/lib/db/schema'
import { unseal } from '@/lib/kalshi/vault'
import { normalizePlayerName } from '@/lib/kalshi/match'

/** Look for new leagues this often. */
const DISCOVER_EVERY_MS = 24 * 3_600_000

export function leagueRowId(
  viewerId: string,
  sport: FantasySport,
  leagueId: string,
): string {
  return `${viewerId}~${sport}~${leagueId}`
}

export async function loadSession(
  env: Pick<CloudflareEnv, 'DB' | 'ESPN_ENCRYPTION_KEY'>,
  viewerId: string,
): Promise<EspnSession | null> {
  const row = await dbFromD1(env.DB)
    .select()
    .from(espnAccounts)
    .where(eq(espnAccounts.viewerId, viewerId))
    .get()
  if (!row) return null
  const [swid, espnS2] = await Promise.all([
    unseal(env.ESPN_ENCRYPTION_KEY, {
      ciphertext: row.swidCiphertext,
      iv: row.swidIv,
    }),
    unseal(env.ESPN_ENCRYPTION_KEY, {
      ciphertext: row.s2Ciphertext,
      iv: row.s2Iv,
    }),
  ])
  return { swid, espnS2 }
}

/** Add the leagues ESPN lists for the Viewer (keeping their choices). */
export async function discover(
  db: Database,
  viewerId: string,
  session: EspnSession,
): Promise<number> {
  const found = discoverLeagues(await fanProfile(session))
  const now = new Date()
  for (const l of found) {
    await db
      .insert(fantasyLeagues)
      .values({
        id: leagueRowId(viewerId, l.sport, l.leagueId),
        viewerId,
        sport: l.sport,
        leagueId: l.leagueId,
        season: Math.max(l.season ?? 0, seasonOf(l.sport, now)),
        teamId: l.teamId,
        name: l.name,
        teamName: l.teamName,
        updatedAt: now.toISOString(),
      })
      .onConflictDoNothing()
  }
  await db
    .update(espnAccounts)
    .set({ discoveredAt: now.toISOString() })
    .where(eq(espnAccounts.viewerId, viewerId))
  return found.length
}

/** Our Players for ESPN's ids (by id where our Source is ESPN, else name). */
async function ourPlayers(
  db: Database,
  sport: FantasySport,
  lineup: ReadonlyArray<{ espnId: number; name: string }>,
): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const source = SPORTS[sport].playerSource
  if (source) {
    const ids = lineup.filter((p) => p.espnId > 0).map((p) => String(p.espnId))
    for (let i = 0; i < ids.length; i += 80) {
      const rows = await db
        .select({ sourceId: sourceIds.sourceId, id: sourceIds.internalId })
        .from(sourceIds)
        .where(
          and(
            eq(sourceIds.entity, 'player'),
            eq(sourceIds.source, source),
            inArray(sourceIds.sourceId, ids.slice(i, i + 80)),
          ),
        )
      for (const r of rows) out.set(Number(r.sourceId), r.id)
    }
    return out
  }
  // No shared ids (baseball): match on name within the League.
  for (const p of lineup) {
    const last = p.name.trim().split(/\s+/).at(-1) ?? ''
    const rows = await db
      .select({ id: players.id, name: players.name })
      .from(players)
      .where(
        and(
          eq(players.league, SPORTS[sport].league),
          sql`${players.name} like ${`%${last}%`}`,
        ),
      )
    const want = normalizePlayerName(p.name)
    const hit = rows.find((r) => normalizePlayerName(r.name) === want)
    if (hit) out.set(p.espnId, hit.id)
  }
  return out
}

/** Our Teams for ESPN's pro team ids (football and basketball share ids). */
async function ourTeams(
  db: Database,
  sport: FantasySport,
  lineup: ReadonlyArray<{ proTeamId: number | null }>,
): Promise<
  Map<number, { id: string; logoUrl: string | null; abbreviation: string }>
> {
  const out = new Map<
    number,
    { id: string; logoUrl: string | null; abbreviation: string }
  >()
  const source = SPORTS[sport].playerSource
  const ids = [
    ...new Set(
      lineup.flatMap((p) => (p.proTeamId ? [String(p.proTeamId)] : [])),
    ),
  ]
  if (!source || ids.length === 0) return out
  const rows = await db
    .select({
      sourceId: sourceIds.sourceId,
      id: teams.id,
      logoUrl: teams.logoUrl,
      abbreviation: teams.abbreviation,
    })
    .from(sourceIds)
    .innerJoin(teams, eq(teams.id, sourceIds.internalId))
    .where(
      and(
        eq(sourceIds.entity, 'team'),
        eq(sourceIds.source, source),
        inArray(sourceIds.sourceId, ids),
        eq(teams.league, SPORTS[sport].league),
      ),
    )
  for (const r of rows) out.set(Number(r.sourceId), r)
  return out
}

/** Read one league's Matchup now and store it, with its Players mapped. */
export async function syncLeague(
  db: Database,
  session: EspnSession,
  row: typeof fantasyLeagues.$inferSelect,
): Promise<MatchupView | null> {
  let league
  let season = row.season
  try {
    league = await leagueViews(session, row.sport, season, row.leagueId)
  } catch (error) {
    // Not renewed for this season yet: read the season ESPN listed.
    const fallback = seasonOf(row.sport, new Date()) - 1
    if (
      !(error instanceof EspnError && error.status === 404) ||
      season === fallback
    )
      throw error
    season = fallback
    league = await leagueViews(session, row.sport, season, row.leagueId)
  }
  const teamId = myTeamId(league, session.swid, row.teamId)
  const view = teamId === null ? null : readMatchup(row.sport, league, teamId)
  if (view) {
    const everyone = [...view.mine.lineup, ...(view.opponent?.lineup ?? [])]
    const ids = await ourPlayers(db, row.sport, everyone)
    const teamsBy = await ourTeams(db, row.sport, everyone)
    for (const p of everyone) {
      p.playerId = ids.get(p.espnId) ?? null
      const t = p.proTeamId === null ? undefined : teamsBy.get(p.proTeamId)
      p.teamId = t?.id ?? null
      p.teamLogo = t?.logoUrl ?? null
      p.teamAbbrev = t?.abbreviation ?? null
    }
    await db
      .delete(fantasyPlayers)
      .where(eq(fantasyPlayers.leagueRowId, row.id))
    const rows = [
      ...view.mine.lineup.map((p) => ({ p, side: 'mine' as const })),
      ...(view.opponent?.lineup ?? []).map((p) => ({
        p,
        side: 'opponent' as const,
      })),
    ].map(({ p, side }) => ({
      leagueRowId: row.id,
      espnId: p.espnId,
      side,
      playerId: p.playerId ?? null,
      starter: p.starter,
    }))
    for (let i = 0; i < rows.length; i += 15) {
      await db
        .insert(fantasyPlayers)
        .values(rows.slice(i, i + 15))
        .onConflictDoNothing()
    }
  }
  await db
    .update(fantasyLeagues)
    .set({
      season,
      teamId,
      name: view?.leagueName ?? row.name,
      teamName: view?.mine.name ?? row.teamName,
      matchup: view,
      lastError:
        teamId === null ? 'Couldn’t find your team in this league.' : null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(fantasyLeagues.id, row.id))
  return view
}

/** Bring one Viewer's Fantasy leagues up to date. */
export async function syncAccount(
  env: Pick<CloudflareEnv, 'DB' | 'ESPN_ENCRYPTION_KEY'>,
  viewerId: string,
): Promise<number> {
  const db = dbFromD1(env.DB)
  const session = await loadSession(env, viewerId)
  if (!session) return 0
  const account = await db
    .select({ discoveredAt: espnAccounts.discoveredAt })
    .from(espnAccounts)
    .where(eq(espnAccounts.viewerId, viewerId))
    .get()
  const fail = async (message: string) =>
    db
      .update(espnAccounts)
      .set({
        status: 'error',
        lastError: message,
        syncedAt: new Date().toISOString(),
      })
      .where(eq(espnAccounts.viewerId, viewerId))
  try {
    if (
      !account?.discoveredAt ||
      Date.now() - Date.parse(account.discoveredAt) > DISCOVER_EVERY_MS
    ) {
      await discover(db, viewerId, session).catch((error: unknown) => {
        // Discovery is a convenience: leagues can be added by URL.
        console.error('ESPN discovery failed', { error: String(error) })
      })
    }
    const leagues = await db
      .select()
      .from(fantasyLeagues)
      .where(
        and(
          eq(fantasyLeagues.viewerId, viewerId),
          eq(fantasyLeagues.enabled, true),
        ),
      )
    let synced = 0
    for (const row of leagues) {
      try {
        await syncLeague(db, session, row)
        synced++
      } catch (error) {
        if (error instanceof EspnError && error.status === 401) throw error
        await db
          .update(fantasyLeagues)
          .set({
            lastError: String(error).slice(0, 200),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(fantasyLeagues.id, row.id))
      }
    }
    await db
      .update(espnAccounts)
      .set({
        status: 'ok',
        lastError: null,
        syncedAt: new Date().toISOString(),
      })
      .where(eq(espnAccounts.viewerId, viewerId))
    return synced
  } catch (error) {
    await fail(
      error instanceof EspnError && error.status === 401
        ? 'ESPN signed this session out. Reconnect with fresh cookies.'
        : String(error).slice(0, 200),
    )
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
    .select({ viewerId: espnAccounts.viewerId })
    .from(espnAccounts)
    .where(or(isNull(espnAccounts.syncedAt), lt(espnAccounts.syncedAt, cutoff)))
    .orderBy(espnAccounts.syncedAt)
    .limit(limit)
  return rows.map((r) => r.viewerId)
}
