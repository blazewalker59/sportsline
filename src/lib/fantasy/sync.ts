/**
 * Keeping Viewers' Fantasy leagues current (CONTEXT.md, "Matchup"). Server
 * only: run by the Scheduler, and when a Viewer connects or adds a league.
 */

import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { shouldRecord } from './race'
import {
  EspnError,
  fanProfile,
  leagueActivity,
  leagueViews,
  playerCards,
  playerPool,
  waiverClaims,
} from './client'
import {
  attachClaims,
  espnActivityPlayerIds,
  espnClaims,
  readEspnActivity,
} from './activity'
import { discoverLeagues } from './discovery'
import { liveProjected } from './liveProjection'
import { countsInMatchupWindow, matchupWindow } from './schedule'
import {
  myTeamId,
  readLeagueMatchups,
  readMatchup,
  readMatchupDay,
  readTeamSides,
} from './matchup'
import { MLB_PRO_TEAMS, NFL_PRO_TEAMS, SPORTS, seasonOf } from './sports'
import { readStandings } from './standings'
import { scoringLeaders } from './leaders'
import { injuryEvents, rostersDue, rostersOf, whoHasOptions } from './whoHas'
import type { ActivityPlayer, LeagueActivity } from './activity'
import type { EspnSession, PlayerCard } from './client'
import type { LeagueCategory } from './categories'
import type { ScoringLeaders } from './leaders'
import type { Standings } from './standings'
import type { LeagueRosters } from './whoHas'
import type {
  LineupPlayer,
  MatchupDay,
  MatchupSide,
  MatchupView,
} from './matchup'
import type { FantasySport } from './sports'
import type { CloudflareEnv, Database } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import {
  espnAccounts,
  fantasyLeagues,
  fantasyPlayers,
  fantasyScorePoints,
  games,
  players,
  sourceIds,
  teams,
  whoHas,
} from '@/lib/db/schema'
import { isLegacy, seal, unseal } from '@/lib/kalshi/vault'
import { normalizePlayerName } from '@/lib/kalshi/match'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'
import { reportError } from '@/lib/ops/errors'

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
  const db = dbFromD1(env.DB)
  const row = await db
    .select()
    .from(espnAccounts)
    .where(eq(espnAccounts.viewerId, viewerId))
    .get()
  if (!row) return null
  const swidSealed = { ciphertext: row.swidCiphertext, iv: row.swidIv }
  const s2Sealed = { ciphertext: row.s2Ciphertext, iv: row.s2Iv }
  const swidContext = { purpose: 'espn-swid', viewerId } as const
  const s2Context = { purpose: 'espn-s2', viewerId } as const
  const [swid, espnS2] = await Promise.all([
    unseal(env.ESPN_ENCRYPTION_KEY, swidSealed, swidContext),
    unseal(env.ESPN_ENCRYPTION_KEY, s2Sealed, s2Context),
  ])
  // Sealed before cookies were bound to their Viewer: bind them now (unless
  // they were reconnected meanwhile).
  if (isLegacy(swidSealed) || isLegacy(s2Sealed)) {
    const [freshSwid, freshS2] = await Promise.all([
      seal(env.ESPN_ENCRYPTION_KEY, swid, swidContext),
      seal(env.ESPN_ENCRYPTION_KEY, espnS2, s2Context),
    ])
    await db
      .update(espnAccounts)
      .set({
        swidCiphertext: freshSwid.ciphertext,
        swidIv: freshSwid.iv,
        s2Ciphertext: freshS2.ciphertext,
        s2Iv: freshS2.iv,
      })
      .where(
        and(
          eq(espnAccounts.viewerId, viewerId),
          eq(espnAccounts.swidCiphertext, row.swidCiphertext),
          eq(espnAccounts.s2Ciphertext, row.s2Ciphertext),
        ),
      )
  }
  return { swid, espnS2 }
}

/** Add the leagues ESPN lists for the Viewer (keeping their choices). */
export async function discover(
  db: Database,
  viewerId: string,
  session: EspnSession,
): Promise<number> {
  const profile = await fanProfile(session)
  // No fan profile under this SWID: leagues come from pasted URLs instead.
  if (profile === null) console.warn('ESPN has no fan profile', { viewerId })
  const found = discoverLeagues(profile)
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

/** A Player as provider data has them, to be matched to ours. */
type Attachable = Pick<
  LineupPlayer,
  | 'espnId'
  | 'sourcePlayerId'
  | 'name'
  | 'proTeamId'
  | 'playerId'
  | 'headshot'
  | 'teamId'
  | 'teamLogo'
  | 'teamAbbrev'
>

/**
 * Our Players for a Lineup's: by ESPN id where our Source is ESPN, else by
 * name (baseball, and providers without ESPN ids): an exact match first,
 * then the same name normalized. Matches already made for this league are
 * reused, so a sync only looks up who's new.
 */
async function ourPlayers(
  db: Database,
  sport: FantasySport,
  lineup: ReadonlyArray<Attachable>,
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
  if (sport !== 'football') return out
  // Sleeper's pro team id is ESPN's. When that Source id isn't mapped yet,
  // the Team row is still there under its abbreviation (BUF, not a second id).
  const missing = ids.filter((id) => !out.has(Number(id)))
  const names = missing.flatMap((id) => {
    const abbr = NFL_PRO_TEAMS[Number(id)]
    return abbr ? [abbr] : []
  })
  if (names.length === 0) return out
  const byAbbrev = await db
    .select({
      id: teams.id,
      logoUrl: teams.logoUrl,
      abbreviation: teams.abbreviation,
    })
    .from(teams)
    .where(and(eq(teams.league, 'nfl'), inArray(teams.abbreviation, names)))
  for (const id of missing) {
    const abbr = NFL_PRO_TEAMS[Number(id)]
    const row = byAbbrev.find((r) => r.abbreviation === abbr)
    if (row) out.set(Number(id), row)
  }
  return out
}

/**
 * Lineup Players matched to ours (with headshots), with their Teams'
 * logos and abbreviations. Changes the Players in place.
 */
export async function attachOurs(
  db: Database,
  row: Pick<typeof fantasyLeagues.$inferSelect, 'id' | 'sport'>,
  everyone: ReadonlyArray<Attachable>,
): Promise<void> {
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
}

/**
 * A Matchup's Players matched to ours, with their Teams; Sleeper's sides
 * get a live projection too (Sleeper sends none).
 */
export async function attachMatchup(
  db: Database,
  row: Pick<typeof fantasyLeagues.$inferSelect, 'id' | 'sport' | 'provider'>,
  view: MatchupView,
): Promise<void> {
  await attachOurs(db, row, [
    ...view.mine.lineup,
    ...(view.opponent?.lineup ?? []),
    ...(view.mine.summary ?? []),
    ...(view.opponent?.summary ?? []),
  ])
  if (row.provider === 'sleeper') await projectLive(db, view)
}

/**
 * Store a league's Matchup (any provider's): its Players mapped to ours
 * (with headshots), their Teams' logos, and who's in it for the feed.
 */
export async function storeMatchup(
  db: Database,
  row: typeof fantasyLeagues.$inferSelect,
  view: MatchupView | null,
  set: {
    season: number
    teamId: number | null
    lastError: string | null
    standings: Standings | null
    leaders: ScoringLeaders | null
    /** Kept only when due (keepLeague); the last ones stay otherwise. */
    rosters?: LeagueRosters
  },
): Promise<void> {
  if (view) {
    await attachMatchup(db, row, view)
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
    await recordRacePoint(db, row.id, view)
  }
  await db
    .update(fantasyLeagues)
    .set({
      season: set.season,
      teamId: set.teamId,
      name: view?.leagueName ?? row.name,
      teamName: view?.mine.name ?? row.teamName,
      matchup: view && { ...view, asOf: new Date().toISOString() },
      standings: set.standings,
      leaders: set.leaders,
      ...(set.rosters ? { rosters: set.rosters } : {}),
      lastError: set.lastError,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(fantasyLeagues.id, row.id))
}

/** Race points older than this go, whatever their period. */
const RACE_KEEP_MS = 10 * 24 * 3_600_000

/**
 * Keep a point of the race (points leagues with an opponent): when the
 * score moved or ten minutes passed. A new matchup period clears the last
 * one's points, along with any past RACE_KEEP_MS. One read, at most one
 * insert, and a delete only when the period turns.
 */
async function recordRacePoint(
  db: Database,
  rowId: string,
  view: MatchupView,
): Promise<void> {
  if (!view.opponent || view.categories) return
  const last = await db
    .select()
    .from(fantasyScorePoints)
    .where(eq(fantasyScorePoints.leagueRowId, rowId))
    .orderBy(desc(fantasyScorePoints.at))
    .limit(1)
    .get()
  const now = Date.now()
  const turned = last !== undefined && last.matchupPeriod !== view.matchupPeriod
  if (turned || (last && now - Date.parse(last.at) > RACE_KEEP_MS))
    await db
      .delete(fantasyScorePoints)
      .where(
        and(
          eq(fantasyScorePoints.leagueRowId, rowId),
          or(
            ne(fantasyScorePoints.matchupPeriod, view.matchupPeriod),
            lt(
              fantasyScorePoints.at,
              new Date(now - RACE_KEEP_MS).toISOString(),
            ),
          ),
        ),
      )
  const next = { mine: view.mine.score, opponent: view.opponent.score }
  if (!shouldRecord(turned ? undefined : last, next, now)) return
  await db
    .insert(fantasyScorePoints)
    .values({
      leagueRowId: rowId,
      at: new Date(now).toISOString(),
      matchupPeriod: view.matchupPeriod,
      ...next,
    })
    .onConflictDoNothing()
}

/** Each side's live projection, from its Starters' Games this week. */
async function projectLive(db: Database, view: MatchupView): Promise<void> {
  const sides = [view.mine, ...(view.opponent ? [view.opponent] : [])]
  const teamIds = [
    ...new Set(
      sides.flatMap((s) =>
        s.lineup.flatMap((p) => (p.starter && p.teamId ? [p.teamId] : [])),
      ),
    ),
  ]
  const { from, to } = matchupWindow('nfl', sportsDayOf(new Date()))
  const rows =
    teamIds.length === 0
      ? []
      : await db
          .select({
            away: games.awayTeamId,
            home: games.homeTeamId,
            status: games.status,
            situation: games.situation,
            sportsDay: games.sportsDay,
            startsAt: games.startsAt,
          })
          .from(games)
          .where(
            and(
              eq(games.league, 'nfl'),
              gte(games.sportsDay, from),
              lte(games.sportsDay, shiftSportsDay(to, 1)),
              or(
                inArray(games.awayTeamId, teamIds),
                inArray(games.homeTeamId, teamIds),
              ),
            ),
          )
  const counted = rows.filter((r) => countsInMatchupWindow(r, { from, to }))
  const gameOf = (p: LineupPlayer) => {
    const g = counted.find((r) => r.away === p.teamId || r.home === p.teamId)
    return g
      ? { status: g.status, segmentLabel: g.situation?.segmentLabel ?? null }
      : undefined
  }
  for (const side of sides)
    side.projected = liveProjected(
      side.lineup.filter((p) => p.starter),
      gameOf,
    )
}

/**
 * The league-wide reads each sync keeps (any provider's), from every
 * team's side: its Scoring leaders, and about hourly its rosters, any
 * Injury Events between the last ones and these becoming Who Has?
 * encounters. Only the leaders' and events' Players are matched to ours.
 */
export async function keepLeague(
  db: Database,
  row: typeof fantasyLeagues.$inferSelect,
  input: {
    scoringPeriod: number
    sides: ReadonlyArray<MatchupSide>
    mine: number | null
    categories: ReadonlyArray<LeagueCategory> | null
  },
  now = new Date(),
): Promise<{ leaders: ScoringLeaders; rosters?: LeagueRosters }> {
  const leaders = scoringLeaders({ sport: row.sport, ...input })
  const due = rostersDue(row.rosters, now)
  const events = due ? injuryEvents(row.rosters, input.sides, input.mine) : []
  await attachOurs(db, row, [
    ...leaders.players,
    ...(leaders.positions ?? []).flatMap((p) => p.players),
    ...leaders.categories.flatMap((c) => c.players),
    ...(leaders.matchupCategories ?? []).flatMap((c) => c.players),
    ...events.map((e) => e.player),
  ])
  const teamsIn = input.sides.map((s) => ({ teamId: s.teamId, name: s.name }))
  for (const e of events) {
    const p = e.player
    await db
      .insert(whoHas)
      .values({
        id: `${row.id}~${p.espnId}~${e.status}`,
        viewerId: row.viewerId,
        leagueRowId: row.id,
        player: {
          espnId: p.espnId,
          ...(p.sourcePlayerId === undefined
            ? {}
            : { sourcePlayerId: p.sourcePlayerId }),
          headshot: p.headshot ?? null,
          playerId: p.playerId ?? null,
          name: p.name,
          positionId: p.positionId,
          proTeamId: p.proTeamId,
          teamId: p.teamId ?? null,
          teamAbbrev: p.teamAbbrev ?? null,
          teamLogo: p.teamLogo ?? null,
        },
        status: e.status,
        ownerTeamId: e.ownerTeamId,
        options: whoHasOptions(p.espnId, e.ownerTeamId, teamsIn),
        createdAt: now.toISOString(),
      })
      .onConflictDoNothing()
  }
  return {
    leaders,
    ...(due && input.sides.length > 0
      ? { rosters: rostersOf(input.sides, now) }
      : {}),
  }
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
  if (view && teamId !== null)
    view.others = readLeagueMatchups(row.sport, league, teamId)
  const kept = await keepLeague(db, row, {
    scoringPeriod:
      view?.scoringPeriod ??
      league.scoringPeriodId ??
      league.status?.latestScoringPeriod ??
      1,
    sides: readTeamSides(row.sport, league),
    mine: teamId,
    categories: view?.categories ?? null,
  })
  await storeMatchup(db, row, view, {
    season,
    teamId,
    lastError:
      teamId === null ? 'Couldn’t find your team in this league.' : null,
    standings: readStandings(league, teamId),
    ...kept,
  })
  return view
}

/**
 * Another day of a Viewer's category Matchup, read from ESPN on demand
 * and not stored (an earlier day is final; a later one has Lineups but no
 * stats yet). Null when the league isn't theirs, isn't a category league
 * on ESPN, the day isn't another day of its current Matchup, or `teamId`
 * isn't in one of its other Matchups.
 */
export async function readDay(
  env: Pick<CloudflareEnv, 'DB' | 'ESPN_ENCRYPTION_KEY'>,
  viewerId: string,
  rowId: string,
  scoringPeriod: number,
  /** Another Matchup's left team (LeagueMatchup); the Viewer's by default. */
  teamId?: number,
): Promise<MatchupDay | null> {
  const db = dbFromD1(env.DB)
  const row = await db
    .select()
    .from(fantasyLeagues)
    .where(
      and(eq(fantasyLeagues.id, rowId), eq(fantasyLeagues.viewerId, viewerId)),
    )
    .get()
  const m = row?.matchup
  if (!row || row.provider !== 'espn' || !m?.categories || row.teamId === null)
    return null
  if (!m.days?.includes(scoringPeriod) || scoringPeriod === m.scoringPeriod)
    return null
  const team = teamId ?? row.teamId
  if (teamId !== undefined && !isOtherMatchup(m, teamId)) return null
  const session = await loadSession(env, viewerId)
  if (!session) return null
  const league = await leagueViews(
    session,
    row.sport,
    row.season,
    row.leagueId,
    scoringPeriod,
  )
  const day = readMatchupDay(row.sport, league, team, scoringPeriod)
  if (day) await attachOurs(db, row, [...day.mine, ...(day.opponent ?? [])])
  return day
}

/** Whether `teamId` is the left team of one of the league's other Matchups. */
export function isOtherMatchup(m: MatchupView, teamId: number): boolean {
  return m.others?.some((o) => o.left.teamId === teamId) ?? false
}

/**
 * Another Matchup in a Viewer's ESPN league, read in full now and not
 * stored: `teamId` on the left, as the league's scoreboard (`others`) has
 * it. Null when the league isn't theirs or that isn't one of its Matchups.
 */
export async function readLeagueMatchup(
  env: Pick<CloudflareEnv, 'DB' | 'ESPN_ENCRYPTION_KEY'>,
  viewerId: string,
  row: typeof fantasyLeagues.$inferSelect,
  teamId: number,
): Promise<MatchupView | null> {
  if (row.viewerId !== viewerId || row.provider !== 'espn') return null
  if (!row.matchup || !isOtherMatchup(row.matchup, teamId)) return null
  // A public league reads without cookies (docs/adr/0004).
  const session = await loadSession(env, viewerId)
  const league = await leagueViews(session, row.sport, row.season, row.leagueId)
  const view = readMatchup(row.sport, league, teamId)
  if (view) await attachMatchup(dbFromD1(env.DB), row, view)
  return view
}

/**
 * A Viewer's ESPN league's Activity, read now and not stored (docs/adr/0004):
 * its feed, then who each Player is in one more read (their names from
 * the rosters kept, should that fail), matched to ours. The teams are the
 * Standings' (or the rosters').
 */
export async function readActivity(
  env: Pick<CloudflareEnv, 'DB' | 'ESPN_ENCRYPTION_KEY'>,
  viewerId: string,
  row: typeof fantasyLeagues.$inferSelect,
): Promise<LeagueActivity | null> {
  if (row.viewerId !== viewerId || row.provider !== 'espn') return null
  // A public league reads without cookies.
  const session = await loadSession(env, viewerId)
  const topics = await leagueActivity(
    session,
    row.sport,
    row.season,
    row.leagueId,
  )
  const ids = espnActivityPlayerIds(topics)
  const [cards, waivers] = await Promise.all([
    playerCards(session, row.sport, row.season, row.leagueId, ids).catch(
      (): Array<PlayerCard> => [],
    ),
    waiverClaims(session, row.sport, row.season, row.leagueId),
  ])
  const known = new Map(cards.map((c) => [c.id, c]))
  // ESPN may not honour a lookup by id for every Player: its most
  // rostered Players name the rest.
  if (ids.some((id) => !known.get(id)?.fullName)) {
    const pool = await playerPool(
      session,
      row.sport,
      row.season,
      row.leagueId,
    ).catch((): Array<PlayerCard> => [])
    for (const c of pool) if (!known.get(c.id)?.fullName) known.set(c.id, c)
  }
  const rostered = new Map(
    (row.rosters?.teams ?? []).flatMap((t) =>
      t.players.map((p) => [p.espnId, p.name] as const),
    ),
  )
  const named = new Map<number, ActivityPlayer>()
  const playerOf = (espnId: number): ActivityPlayer => {
    let p = named.get(espnId)
    if (!p) {
      const card = known.get(espnId)
      p = {
        espnId,
        name: card?.fullName ?? rostered.get(espnId) ?? unnamed(espnId),
        positionId: card?.defaultPositionId ?? null,
        proTeamId: card?.proTeamId ?? null,
      }
      named.set(espnId, p)
    }
    return p
  }
  const entries = readEspnActivity(topics, playerOf)
  attachClaims(entries, espnClaims(waivers))
  const db = dbFromD1(env.DB)
  const everyone = [...named.values()]
  await attachOurs(db, row, everyone)
  await nameFromOurs(db, everyone)
  const leagueTeams =
    row.standings?.rows.map(({ teamId, name, abbrev }) => ({
      teamId,
      name,
      abbrev,
    })) ??
    row.rosters?.teams.map(({ teamId, name, abbrev }) => ({
      teamId,
      name,
      abbrev,
    })) ??
    []
  return { teams: leagueTeams, entries }
}

const unnamed = (espnId: number) => `Player ${espnId}`

/**
 * Players ESPN didn't name, named from ours: ESPN's ids are our Source's
 * in football and basketball, so a match by id has their name.
 */
async function nameFromOurs(
  db: Database,
  everyone: ReadonlyArray<ActivityPlayer>,
): Promise<void> {
  const missing = everyone.filter(
    (p) => p.name === unnamed(p.espnId) && p.playerId,
  )
  if (missing.length === 0) return
  const rows = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(
      inArray(
        players.id,
        missing.map((p) => p.playerId!),
      ),
    )
  const names = new Map(rows.map((r) => [r.id, r.name]))
  for (const p of missing) p.name = names.get(p.playerId!) ?? p.name
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
      // Discovery is a convenience: leagues can be added by URL. A failed
      // attempt still counts for the day, so it isn't retried every sync.
      await discover(db, viewerId, session).catch(async (error: unknown) => {
        await reportError(env, 'espn', error, { viewerId, step: 'discovery' })
        await db
          .update(espnAccounts)
          .set({ discoveredAt: new Date().toISOString() })
          .where(eq(espnAccounts.viewerId, viewerId))
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
