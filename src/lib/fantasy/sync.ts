/**
 * Keeping Viewers' Fantasy leagues current (CONTEXT.md, "Matchup"). Server
 * only: run by the Scheduler, and when a Viewer connects or adds a league.
 */

import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { EspnError, fanProfile, leagueViews } from './client'
import { discoverLeagues } from './discovery'
import { myTeamId, readMatchup } from './matchup'
import { MLB_PRO_TEAMS, NFL_PRO_TEAMS, SPORTS, seasonOf } from './sports'
import type { EspnSession } from './client'
import type { LineupPlayer, MatchupView } from './matchup'
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

/**
 * Our Players for a Lineup's: by ESPN id where our Source is ESPN, else by
 * name (baseball, and providers without ESPN ids): an exact match first,
 * then the same name normalized. Matches already made for this league are
 * reused, so a sync only looks up who's new.
 */
async function ourPlayers(
  db: Database,
  sport: FantasySport,
  lineup: ReadonlyArray<LineupPlayer>,
  rowId: string,
): Promise<Map<number, { id: string; headshotUrl: string | null }>> {
  const out = new Map<number, { id: string; headshotUrl: string | null }>()
  const source = SPORTS[sport].playerSource
  const byId = lineup.filter(
    (p) => source && p.espnId > 0 && p.sourcePlayerId === undefined,
  )
  const ids = byId.map((p) => String(p.espnId))
  for (let i = 0; i < ids.length; i += 80) {
    const rows = await db
      .select({
        sourceId: sourceIds.sourceId,
        id: sourceIds.internalId,
        headshotUrl: players.headshotUrl,
      })
      .from(sourceIds)
      .innerJoin(players, eq(players.id, sourceIds.internalId))
      .where(
        and(
          eq(sourceIds.entity, 'player'),
          eq(sourceIds.source, source!),
          inArray(sourceIds.sourceId, ids.slice(i, i + 80)),
        ),
      )
    for (const r of rows) out.set(Number(r.sourceId), r)
  }
  let byName = lineup.filter(
    (p) => !byId.includes(p) && p.espnId > 0 && p.name && !/^#/.test(p.name),
  )
  if (byName.length === 0) return out
  // Matches this league already has.
  const known = await db
    .select({
      espnId: fantasyPlayers.espnId,
      id: fantasyPlayers.playerId,
      headshotUrl: players.headshotUrl,
    })
    .from(fantasyPlayers)
    .innerJoin(players, eq(players.id, fantasyPlayers.playerId))
    .where(eq(fantasyPlayers.leagueRowId, rowId))
  for (const k of known)
    if (k.id) out.set(k.espnId, { id: k.id, headshotUrl: k.headshotUrl })
  byName = byName.filter((p) => !out.has(p.espnId))
  const league = SPORTS[sport].league
  const names = [...new Set(byName.map((p) => p.name))]
  const exact = new Map<string, { id: string; headshotUrl: string | null }>()
  for (let i = 0; i < names.length; i += 80) {
    const rows = await db
      .select({
        id: players.id,
        name: players.name,
        headshotUrl: players.headshotUrl,
      })
      .from(players)
      .where(
        and(
          eq(players.league, league),
          inArray(players.name, names.slice(i, i + 80)),
        ),
      )
    for (const r of rows) exact.set(r.name, r)
  }
  for (const p of byName) {
    const hit = exact.get(p.name)
    if (hit) {
      out.set(p.espnId, hit)
      continue
    }
    // Suffixes and punctuation differ between providers ("Jr.", "D.J.").
    const last = p.name.trim().split(/\s+/).at(-1) ?? ''
    const rows = await db
      .select({
        id: players.id,
        name: players.name,
        headshotUrl: players.headshotUrl,
      })
      .from(players)
      .where(
        and(
          eq(players.league, league),
          sql`${players.name} like ${`%${last}%`}`,
        ),
      )
    const want = normalizePlayerName(p.name)
    const found = rows.find((r) => normalizePlayerName(r.name) === want)
    if (found) out.set(p.espnId, found)
  }
  return out
}

/**
 * Our Teams for ESPN's pro team ids: football and basketball share ESPN's
 * ids; baseball's MLB Teams come from MLB, so they're matched by abbreviation.
 */
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
  if (ids.length === 0) return out
  if (sport === 'baseball') {
    const abbrevs = ids.flatMap((id) => MLB_PRO_TEAMS[Number(id)] ?? [])
    const rows = await db
      .select({
        id: teams.id,
        logoUrl: teams.logoUrl,
        abbreviation: teams.abbreviation,
      })
      .from(teams)
      .where(and(eq(teams.league, 'mlb'), inArray(teams.abbreviation, abbrevs)))
    for (const id of ids) {
      const row = rows.find((r) => r.abbreviation === MLB_PRO_TEAMS[Number(id)])
      if (row) out.set(Number(id), row)
    }
    return out
  }
  if (!source) return out
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

/**
 * Store a league's Matchup (any provider's): its Players mapped to ours
 * (with headshots), their Teams' logos, and who's in it for the feed.
 */
export async function storeMatchup(
  db: Database,
  row: typeof fantasyLeagues.$inferSelect,
  view: MatchupView | null,
  set: { season: number; teamId: number | null; lastError: string | null },
): Promise<void> {
  if (view) {
    const everyone = [...view.mine.lineup, ...(view.opponent?.lineup ?? [])]
    const ids = await ourPlayers(db, row.sport, everyone, row.id)
    const teamsBy = await ourTeams(db, row.sport, everyone)
    for (const p of everyone) {
      const ours = ids.get(p.espnId)
      p.playerId = ours?.id ?? null
      if (p.sourcePlayerId !== undefined) p.headshot = ours?.headshotUrl ?? null
      const t = p.proTeamId === null ? undefined : teamsBy.get(p.proTeamId)
      // NFL logos and abbreviations from ESPN's fixed team ids, so a stored
      // Team's record can never put another League's logo on a D/ST.
      const nfl =
        row.sport === 'football' && p.proTeamId !== null
          ? NFL_PRO_TEAMS[p.proTeamId]
          : undefined
      p.teamId = t?.id ?? null
      p.teamLogo = nfl
        ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500-dark/${nfl.toLowerCase()}.png&w=80&h=80`
        : (t?.logoUrl ?? null)
      p.teamAbbrev = nfl ?? t?.abbreviation ?? null
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
      season: set.season,
      teamId: set.teamId,
      name: view?.leagueName ?? row.name,
      teamName: view?.mine.name ?? row.teamName,
      matchup: view,
      lastError: set.lastError,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(fantasyLeagues.id, row.id))
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
  await storeMatchup(db, row, view, {
    season,
    teamId,
    lastError:
      teamId === null ? 'Couldn’t find your team in this league.' : null,
  })
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
          eq(fantasyLeagues.provider, 'espn'),
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
