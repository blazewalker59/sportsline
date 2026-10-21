/**
 * ESPN Fantasy over HTTP for the signed-in Viewer (docs/adr/0004):
 * connect with session cookies, manage leagues, read Matchups.
 */

import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { EspnError, bracedSwid, fanProfile } from './client'
import { discoverConnectedLeagues } from './discoverNow'
import { leagueFromUrl } from './discovery'
import { seasonOf } from './sports'
import {
  leagueRowId,
  loadSession,
  readActivity,
  readDay,
  readLeagueMatchup,
  syncAccount,
  syncLeague,
} from './sync'
import { sleeperUser } from './sleeper/client'
import {
  readActivity as readSleeperActivity,
  readLeagueMatchup as readSleeperLeagueMatchup,
  sleeperLeagueRowId,
  syncAccount as syncSleeper,
} from './sleeper/sync'
import { WHO_HAS_FOR_MS } from './whoHas'
import { readWhatIf } from './whatIfRead'
import type { MatchupDay, MatchupView } from './matchup'
import type { RacePoint } from './race'
import type { FantasySport } from './sports'
import type { LeagueActivity } from './activity'
import type { LeagueWhatIf } from './whatIfRead'
import type { ScoringLeaders } from './leaders'
import type { Standings } from './standings'
import type { WhoHasOption, WhoHasPlayer } from './whoHas'
import type { Database } from '@/lib/db'
import { viewerMiddleware } from '@/lib/viewer/middleware'
import { getCloudflareEnv } from '@/lib/db'
import {
  espnAccounts,
  fantasyLeagues,
  fantasyScorePoints,
  sleeperAccounts,
  whoHas,
} from '@/lib/db/schema'
import { seal } from '@/lib/kalshi/vault'
import { reportError } from '@/lib/ops/errors'
import { startViewerSync } from '@/lib/live/startViewerSync'
import { UserError } from '@/lib/userError'

export interface EspnConnection {
  status: 'ok' | 'error'
  lastError: string | null
  syncedAt: string | null
}

export interface FantasyLeagueView {
  id: string
  sport: FantasySport
  provider: 'espn' | 'sleeper'
  name: string
  teamName: string | null
  enabled: boolean
  lastError: string | null
  updatedAt: string
  matchup: MatchupView | null
}

export const getEspnConnection = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .handler(
    async ({ context: { db, viewerId } }): Promise<EspnConnection | null> => {
      const row = await db
        .select()
        .from(espnAccounts)
        .where(eq(espnAccounts.viewerId, viewerId))
        .get()
      return row
        ? {
            status: row.status,
            lastError: row.lastError,
            syncedAt: row.syncedAt,
          }
        : null
    },
  )

/**
 * Connect ESPN with the Viewer's session cookies: ESPN must accept them,
 * and they're sealed before they're stored (docs/adr/0004).
 */
export const connectEspn = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator((data: { swid: string; espnS2: string }) =>
    z
      .object({
        swid: z
          .string()
          .trim()
          .regex(/^\{?[0-9A-Fa-f-]{36}\}?$/, 'That isn’t a SWID.'),
        espnS2: z.string().trim().min(40).max(2000),
      })
      .parse(data),
  )
  .handler(
    async ({ data, context: { db, viewerId } }): Promise<EspnConnection> => {
      const env = getCloudflareEnv()
      const session = {
        swid: bracedSwid(data.swid),
        espnS2: decodedCookie(data.espnS2),
      }
      try {
        await fanProfile(session)
      } catch (error) {
        if (
          error instanceof EspnError &&
          (error.status === 401 || error.status === 403)
        ) {
          throw new UserError(
            'ESPN didn’t accept these cookies. Sign in on espn.com and copy them again.',
          )
        }
        // Discovery being down shouldn't stop a connection: leagues can be
        // added by URL.
      }
      const [swid, s2] = await Promise.all([
        seal(env.ESPN_ENCRYPTION_KEY, session.swid, {
          purpose: 'espn-swid',
          viewerId,
        }),
        seal(env.ESPN_ENCRYPTION_KEY, session.espnS2, {
          purpose: 'espn-s2',
          viewerId,
        }),
      ])
      const now = new Date().toISOString()
      const row = {
        viewerId,
        swidCiphertext: swid.ciphertext,
        swidIv: swid.iv,
        s2Ciphertext: s2.ciphertext,
        s2Iv: s2.iv,
        status: 'ok' as const,
        lastError: null,
        connectedAt: now,
        syncedAt: null,
        discoveredAt: null,
      }
      await db
        .insert(espnAccounts)
        .values(row)
        .onConflictDoUpdate({ target: espnAccounts.viewerId, set: row })
      await syncAccount(env, viewerId).catch((error: unknown) =>
        reportError(env, 'espn', error, { viewerId, step: 'connect' }),
      )
      await startViewerSync(env, viewerId)
      return { status: 'ok', lastError: null, syncedAt: now }
    },
  )

/** espn_s2 as copied is usually URL-encoded; a broken escape isn't one. */
function decodedCookie(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new UserError(
      'That espn_s2 cookie looks cut off or mangled. Copy it again from espn.com.',
    )
  }
}

/** Forget the cookies and every Fantasy league read with them. */
export const disconnectEspn = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .handler(async ({ context: { db, viewerId } }) => {
    // In one batch: a failure halfway can't leave the cookies behind.
    await db.batch([
      db
        .delete(fantasyLeagues)
        .where(
          and(
            eq(fantasyLeagues.viewerId, viewerId),
            eq(fantasyLeagues.provider, 'espn'),
          ),
        ),
      db.delete(espnAccounts).where(eq(espnAccounts.viewerId, viewerId)),
    ])
  })

export const syncFantasyNow = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .handler(async ({ context: { db, viewerId } }) => {
    const env = getCloudflareEnv()
    const connected = await discoverConnectedLeagues(env, db, viewerId)
    const [espn, sleeperCount] = await Promise.all([
      connected.espn ? syncAccount(env, viewerId) : 0,
      connected.sleeper ? syncSleeper(env, viewerId) : 0,
    ])
    return espn + sleeperCount
  })

export interface SleeperConnection {
  username: string
  status: 'ok' | 'error'
  lastError: string | null
  syncedAt: string | null
}

export const getSleeperConnection = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .handler(
    async ({
      context: { db, viewerId },
    }): Promise<SleeperConnection | null> => {
      const row = await db
        .select()
        .from(sleeperAccounts)
        .where(eq(sleeperAccounts.viewerId, viewerId))
        .get()
      return row
        ? {
            username: row.username,
            status: row.status,
            lastError: row.lastError,
            syncedAt: row.syncedAt,
          }
        : null
    },
  )

/** Connect Sleeper by username: public, so nothing secret is kept. */
export const connectSleeper = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator((data: { username: string }) =>
    z
      .object({
        username: z
          .string()
          .trim()
          .min(2)
          .max(40)
          .regex(/^[\w.-]+$/, 'That isn’t a Sleeper username.'),
      })
      .parse(data),
  )
  .handler(
    async ({ data, context: { db, viewerId } }): Promise<SleeperConnection> => {
      const user = await sleeperUser(data.username).catch(() => null)
      if (!user?.user_id)
        throw new UserError(
          'Sleeper has no user by that name. Check the spelling.',
        )
      const now = new Date().toISOString()
      const row = {
        viewerId,
        username: user.username ?? data.username,
        userId: user.user_id,
        status: 'ok' as const,
        lastError: null,
        connectedAt: now,
        syncedAt: null,
        discoveredAt: null,
      }
      await db
        .insert(sleeperAccounts)
        .values(row)
        .onConflictDoUpdate({ target: sleeperAccounts.viewerId, set: row })
      const env = getCloudflareEnv()
      await syncSleeper(env, viewerId).catch((error: unknown) =>
        reportError(env, 'sleeper', error, { viewerId, step: 'connect' }),
      )
      await startViewerSync(env, viewerId)
      return {
        username: row.username,
        status: 'ok',
        lastError: null,
        syncedAt: now,
      }
    },
  )

/** Forget the Sleeper account and its leagues. */
export const disconnectSleeper = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .handler(async ({ context: { db, viewerId } }) => {
    await db.batch([
      db
        .delete(fantasyLeagues)
        .where(
          and(
            eq(fantasyLeagues.viewerId, viewerId),
            eq(fantasyLeagues.provider, 'sleeper'),
          ),
        ),
      db.delete(sleeperAccounts).where(eq(sleeperAccounts.viewerId, viewerId)),
    ])
  })

/** Add a league from its ESPN URL (for one discovery missed). */
export const addFantasyLeague = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator((data: { url: string }) =>
    z.object({ url: z.string().trim().max(500) }).parse(data),
  )
  .handler(async ({ data, context: { db, viewerId } }) => {
    const sleeperId = /sleeper\.(?:com|app)\/leagues\/(\d+)/.exec(data.url)?.[1]
    if (sleeperId) {
      const account = await db
        .select()
        .from(sleeperAccounts)
        .where(eq(sleeperAccounts.viewerId, viewerId))
        .get()
      if (!account) throw new UserError('Connect Sleeper first.')
      await db
        .insert(fantasyLeagues)
        .values({
          id: sleeperLeagueRowId(viewerId, sleeperId),
          viewerId,
          sport: 'football',
          provider: 'sleeper',
          leagueId: sleeperId,
          season: new Date().getUTCFullYear(),
          name: `League ${sleeperId}`,
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: fantasyLeagues.id,
          set: { enabled: true },
        })
      await syncSleeper(getCloudflareEnv(), viewerId)
      return
    }
    const parsed = leagueFromUrl(data.url)
    if (!parsed) {
      throw new UserError(
        'Paste the league’s URL from fantasy.espn.com (with leagueId= in it) or sleeper.com/leagues/….',
      )
    }
    const env = getCloudflareEnv()
    const session = await loadSession(env, viewerId)
    if (!session) throw new UserError('Connect ESPN first.')
    const id = leagueRowId(viewerId, parsed.sport, parsed.leagueId)
    await db
      .insert(fantasyLeagues)
      .values({
        id,
        viewerId,
        sport: parsed.sport,
        leagueId: parsed.leagueId,
        season: seasonOf(parsed.sport, new Date()),
        teamId: parsed.teamId,
        name: `League ${parsed.leagueId}`,
        enabled: true,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: fantasyLeagues.id,
        set: { enabled: true },
      })
    const row = (await db
      .select()
      .from(fantasyLeagues)
      .where(eq(fantasyLeagues.id, id))
      .get())!
    try {
      await syncLeague(db, session, row)
    } catch (error) {
      throw new UserError(
        error instanceof EspnError && error.status === 404
          ? 'ESPN has no such league this season.'
          : 'Couldn’t read that league from ESPN.',
      )
    }
  })

export const setFantasyLeagueEnabled = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator((data: { id: string; enabled: boolean }) =>
    z.object({ id: z.string().max(300), enabled: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context: { db, viewerId } }) => {
    await db
      .update(fantasyLeagues)
      .set({ enabled: data.enabled })
      .where(
        and(
          eq(fantasyLeagues.id, data.id),
          eq(fantasyLeagues.viewerId, viewerId),
        ),
      )
  })

/** Save the Viewer's order for their leagues (ids, first to last). */
export const reorderFantasyLeagues = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator((data: { ids: Array<string> }) =>
    z.object({ ids: z.array(z.string().max(300)).max(60) }).parse(data),
  )
  .handler(async ({ data, context: { db, viewerId } }) => {
    // All or nothing: half a reorder would leave positions colliding.
    const [first, ...rest] = data.ids.map((id, position) =>
      db
        .update(fantasyLeagues)
        .set({ position })
        .where(
          and(eq(fantasyLeagues.id, id), eq(fantasyLeagues.viewerId, viewerId)),
        ),
    )
    if (first) await db.batch([first, ...rest])
  })

/** The race on a Matchup sheet: this period's score points, oldest first. */
export const getMatchupRace = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .validator((data: { leagueId: string }) =>
    z.object({ leagueId: z.string().max(300) }).parse(data),
  )
  .handler(
    async ({ data, context: { db, viewerId } }): Promise<Array<RacePoint>> => {
      // Only the Viewer's own league, and only its current period.
      const league = await db
        .select({ matchup: fantasyLeagues.matchup })
        .from(fantasyLeagues)
        .where(
          and(
            eq(fantasyLeagues.id, data.leagueId),
            eq(fantasyLeagues.viewerId, viewerId),
          ),
        )
        .get()
      const period = league?.matchup?.matchupPeriod
      if (period === undefined) return []
      return db
        .select({
          at: fantasyScorePoints.at,
          mine: fantasyScorePoints.mine,
          opponent: fantasyScorePoints.opponent,
        })
        .from(fantasyScorePoints)
        .where(
          and(
            eq(fantasyScorePoints.leagueRowId, data.leagueId),
            eq(fantasyScorePoints.matchupPeriod, period),
          ),
        )
        .orderBy(asc(fantasyScorePoints.at))
    },
  )

/** Another day of a category Matchup, for stepping through its days. */
export const getMatchupDay = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .validator(
    (data: { leagueId: string; scoringPeriod: number; teamId?: number }) =>
      z
        .object({
          leagueId: z.string().max(300),
          scoringPeriod: z.number().int().min(0).max(400),
          // Another Matchup in the league (its left team), not the Viewer's.
          teamId: z.number().int().optional(),
        })
        .parse(data),
  )
  .handler(
    async ({ data, context: { viewerId } }): Promise<MatchupDay | null> => {
      const env = getCloudflareEnv()
      try {
        return await readDay(
          env,
          viewerId,
          data.leagueId,
          data.scoringPeriod,
          data.teamId,
        )
      } catch (error) {
        await reportError(env, 'espn', error, {
          viewerId,
          step: 'day',
          scoringPeriod: data.scoringPeriod,
        })
        throw new UserError('Couldn’t read that day from ESPN.')
      }
    },
  )

/**
 * Another Matchup in one of the Viewer's leagues, in full: read from its
 * provider now, as the Viewer's own is on each sync, and never stored.
 * Null when it isn't one of that league's Matchups any more.
 */
export const getLeagueMatchup = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .validator((data: { leagueId: string; teamId: number }) =>
    z
      .object({ leagueId: z.string().max(300), teamId: z.number().int() })
      .parse(data),
  )
  .handler(
    async ({
      data,
      context: { db, viewerId },
    }): Promise<MatchupView | null> => {
      const env = getCloudflareEnv()
      const row = await db
        .select()
        .from(fantasyLeagues)
        .where(
          and(
            eq(fantasyLeagues.id, data.leagueId),
            eq(fantasyLeagues.viewerId, viewerId),
          ),
        )
        .get()
      if (!row) return null
      const provider = row.provider === 'sleeper' ? 'Sleeper' : 'ESPN'
      try {
        return row.provider === 'sleeper'
          ? await readSleeperLeagueMatchup(db, row, data.teamId)
          : await readLeagueMatchup(env, viewerId, row, data.teamId)
      } catch (error) {
        await reportError(env, row.provider, error, {
          viewerId,
          step: 'league-matchup',
        })
        throw new UserError(`Couldn’t read that matchup from ${provider}.`)
      }
    },
  )

/**
 * One of the Viewer's leagues for its page: the league, its Standings and
 * its Scoring leaders.
 */
export interface FantasyLeaguePage {
  league: FantasyLeagueView
  standings: Standings | null
  leaders: ScoringLeaders | null
}

export const getFantasyLeague = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .validator((data: { leagueId: string }) =>
    z.object({ leagueId: z.string().max(300) }).parse(data),
  )
  .handler(
    async ({
      data,
      context: { db, viewerId },
    }): Promise<FantasyLeaguePage | null> => {
      const row = await db
        .select({
          ...LEAGUE_VIEW,
          standings: fantasyLeagues.standings,
          leaders: fantasyLeagues.leaders,
        })
        .from(fantasyLeagues)
        .where(
          and(
            eq(fantasyLeagues.id, data.leagueId),
            eq(fantasyLeagues.viewerId, viewerId),
          ),
        )
        .get()
      return row
        ? {
            league: leagueView(row),
            standings: row.standings ?? null,
            leaders: row.leaders ?? null,
          }
        : null
    },
  )

/** A Who Has? encounter as it's offered: the Player and four teams. */
export interface WhoHasView {
  id: string
  sport: FantasySport
  leagueName: string
  player: WhoHasPlayer
  status: string
  options: Array<WhoHasOption>
}

export interface WhoHasRecord {
  right: number
  answered: number
}

/**
 * A Who Has? encounter to offer now, if any: one of the Viewer's open
 * ones (fresh, unanswered, in a league they show), picked at random.
 */
export const getWhoHas = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .handler(
    async ({
      context: { db, viewerId },
    }): Promise<{ encounter: WhoHasView | null; record: WhoHasRecord }> => {
      const since = new Date(Date.now() - WHO_HAS_FOR_MS).toISOString()
      const [open, record] = await Promise.all([
        db
          .select({
            id: whoHas.id,
            sport: fantasyLeagues.sport,
            leagueName: fantasyLeagues.name,
            player: whoHas.player,
            status: whoHas.status,
            options: whoHas.options,
          })
          .from(whoHas)
          .innerJoin(fantasyLeagues, eq(fantasyLeagues.id, whoHas.leagueRowId))
          .where(
            and(
              eq(whoHas.viewerId, viewerId),
              isNull(whoHas.answeredAt),
              gte(whoHas.createdAt, since),
              eq(fantasyLeagues.enabled, true),
            ),
          )
          .limit(20),
        whoHasRecord(db, viewerId),
      ])
      const encounter =
        open.length === 0 ? null : open[Math.floor(Math.random() * open.length)]
      return { encounter, record }
    },
  )

async function whoHasRecord(
  db: Database,
  viewerId: string,
): Promise<WhoHasRecord> {
  const row = await db
    .select({
      answered: sql<number>`count(${whoHas.guessTeamId})`,
      right: sql<number>`coalesce(sum(${whoHas.guessTeamId} = ${whoHas.ownerTeamId}), 0)`,
    })
    .from(whoHas)
    .where(eq(whoHas.viewerId, viewerId))
    .get()
  return {
    right: Number(row?.right ?? 0),
    answered: Number(row?.answered ?? 0),
  }
}

/**
 * Answer a Who Has? encounter (or pass on it, with no team): it's never
 * offered again. Says who has the Player, and the Viewer's record.
 */
export const answerWhoHas = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator((data: { id: string; teamId: number | null }) =>
    z
      .object({
        id: z.string().max(400),
        teamId: z.number().int().nullable(),
      })
      .parse(data),
  )
  .handler(
    async ({
      data,
      context: { db, viewerId },
    }): Promise<{ ownerTeamId: number; record: WhoHasRecord } | null> => {
      const row = await db
        .select()
        .from(whoHas)
        .where(and(eq(whoHas.id, data.id), eq(whoHas.viewerId, viewerId)))
        .get()
      if (!row) return null
      if (row.answeredAt === null)
        await db
          .update(whoHas)
          .set({
            answeredAt: new Date().toISOString(),
            guessTeamId: data.teamId,
          })
          .where(eq(whoHas.id, row.id))
      return {
        ownerTeamId: row.ownerTeamId,
        record: await whoHasRecord(db, viewerId),
      }
    },
  )

/** The columns a league's view reads (not its Standings, leaders or rosters). */
const LEAGUE_VIEW = {
  id: fantasyLeagues.id,
  sport: fantasyLeagues.sport,
  provider: fantasyLeagues.provider,
  name: fantasyLeagues.name,
  teamName: fantasyLeagues.teamName,
  enabled: fantasyLeagues.enabled,
  lastError: fantasyLeagues.lastError,
  updatedAt: fantasyLeagues.updatedAt,
  matchup: fantasyLeagues.matchup,
}

function leagueView(
  r: Pick<typeof fantasyLeagues.$inferSelect, keyof typeof LEAGUE_VIEW>,
): FantasyLeagueView {
  return {
    id: r.id,
    sport: r.sport,
    provider: r.provider,
    name: r.name,
    teamName: r.teamName,
    enabled: r.enabled,
    lastError: r.lastError,
    updatedAt: r.updatedAt,
    matchup: r.matchup ?? null,
  }
}

/**
 * A Viewer's league's Activity, read from its provider while they look
 * (never stored).
 */
export const getLeagueActivity = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .validator((data: { leagueId: string }) =>
    z.object({ leagueId: z.string().max(300) }).parse(data),
  )
  .handler(
    async ({
      data,
      context: { db, viewerId },
    }): Promise<LeagueActivity | null> => {
      const env = getCloudflareEnv()
      const row = await db
        .select()
        .from(fantasyLeagues)
        .where(
          and(
            eq(fantasyLeagues.id, data.leagueId),
            eq(fantasyLeagues.viewerId, viewerId),
          ),
        )
        .get()
      if (!row) return null
      const provider = row.provider === 'sleeper' ? 'Sleeper' : 'ESPN'
      try {
        return row.provider === 'sleeper'
          ? await readSleeperActivity(db, row)
          : await readActivity(env, viewerId, row)
      } catch (error) {
        await reportError(env, row.provider, error, {
          viewerId,
          step: 'league-activity',
        })
        throw new UserError(
          `Couldn’t read the league’s activity from ${provider}.`,
        )
      }
    },
  )

/**
 * A football points league's What-if standings: finished weeks not yet
 * kept are read from the provider now.
 */
export const getWhatIf = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .validator((data: { leagueId: string }) =>
    z.object({ leagueId: z.string().max(300) }).parse(data),
  )
  .handler(
    async ({
      data,
      context: { db, viewerId },
    }): Promise<LeagueWhatIf | null> => {
      const env = getCloudflareEnv()
      const row = await db
        .select()
        .from(fantasyLeagues)
        .where(
          and(
            eq(fantasyLeagues.id, data.leagueId),
            eq(fantasyLeagues.viewerId, viewerId),
          ),
        )
        .get()
      if (!row) return null
      try {
        return await readWhatIf(env, viewerId, row)
      } catch (error) {
        await reportError(env, row.provider, error, {
          viewerId,
          step: 'what-if',
        })
        const provider = row.provider === 'sleeper' ? 'Sleeper' : 'ESPN'
        throw new UserError(`Couldn’t read past weeks from ${provider}.`)
      }
    },
  )

export const getFantasy = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .handler(
    async ({
      context: { db, viewerId },
    }): Promise<Array<FantasyLeagueView>> => {
      const rows = await db
        .select(LEAGUE_VIEW)
        .from(fantasyLeagues)
        .where(eq(fantasyLeagues.viewerId, viewerId))
        // The Viewer's order; leagues they haven't placed after, by sport.
        .orderBy(
          sql`${fantasyLeagues.position} is null`,
          fantasyLeagues.position,
          desc(fantasyLeagues.enabled),
          fantasyLeagues.sport,
          fantasyLeagues.name,
        )
      return rows.map(leagueView)
    },
  )
