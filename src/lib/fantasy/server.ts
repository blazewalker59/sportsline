/**
 * ESPN Fantasy over HTTP for the signed-in Viewer (docs/adr/0004):
 * connect with session cookies, manage leagues, read Matchups.
 */

import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { EspnError, bracedSwid, fanProfile } from './client'
import { leagueFromUrl } from './discovery'
import { seasonOf } from './sports'
import {
  discover,
  leagueRowId,
  loadSession,
  syncAccount,
  syncLeague,
} from './sync'
import { sleeperState, sleeperUser } from './sleeper/client'
import {
  discover as discoverSleeper,
  sleeperLeagueRowId,
  syncAccount as syncSleeper,
} from './sleeper/sync'
import type { MatchupView } from './matchup'
import type { RacePoint } from './race'
import type { FantasySport } from './sports'
import { getCloudflareEnv } from '@/lib/db'
import {
  espnAccounts,
  fantasyLeagues,
  fantasyScorePoints,
  sleeperAccounts,
} from '@/lib/db/schema'
import { seal } from '@/lib/kalshi/vault'
import { sessionViewer, withViewer } from '@/lib/viewer/session'
import { reportError } from '@/lib/ops/errors'
import { startViewerSync } from '@/lib/live/startViewerSync'

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

export const getEspnConnection = createServerFn({ method: 'GET' }).handler(
  async (): Promise<EspnConnection | null> => {
    if (!(await sessionViewer())) return null
    return withViewer(async ({ db, viewerId }) => {
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
    })
  },
)

/**
 * Connect ESPN with the Viewer's session cookies: ESPN must accept them,
 * and they're sealed before they're stored (docs/adr/0004).
 */
export const connectEspn = createServerFn({ method: 'POST' })
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
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }): Promise<EspnConnection> => {
      const env = getCloudflareEnv()
      const session = {
        swid: bracedSwid(data.swid),
        espnS2: decodeURIComponent(data.espnS2),
      }
      try {
        await fanProfile(session)
      } catch (error) {
        if (
          error instanceof EspnError &&
          (error.status === 401 || error.status === 403)
        ) {
          throw new Error(
            'ESPN didn’t accept these cookies. Sign in on espn.com and copy them again.',
          )
        }
        // Discovery being down shouldn't stop a connection: leagues can be
        // added by URL.
      }
      const [swid, s2] = await Promise.all([
        seal(env.ESPN_ENCRYPTION_KEY, session.swid),
        seal(env.ESPN_ENCRYPTION_KEY, session.espnS2),
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
    }),
  )

/** Forget the cookies and every Fantasy league read with them. */
export const disconnectEspn = createServerFn({ method: 'POST' }).handler(() =>
  withViewer(async ({ db, viewerId }) => {
    await db
      .delete(fantasyLeagues)
      .where(
        and(
          eq(fantasyLeagues.viewerId, viewerId),
          eq(fantasyLeagues.provider, 'espn'),
        ),
      )
    await db.delete(espnAccounts).where(eq(espnAccounts.viewerId, viewerId))
  }),
)

export const syncFantasyNow = createServerFn({ method: 'POST' }).handler(() =>
  withViewer(async ({ db, viewerId }) => {
    const env = getCloudflareEnv()
    // A manual sync also looks for new leagues, on every connection.
    const session = await loadSession(env, viewerId)
    if (session) await discover(db, viewerId, session).catch(() => 0)
    const sleeper = await db
      .select()
      .from(sleeperAccounts)
      .where(eq(sleeperAccounts.viewerId, viewerId))
      .get()
    if (sleeper) {
      await sleeperState()
        .then((state) => discoverSleeper(db, viewerId, sleeper.userId, state))
        .catch(() => 0)
    }
    const [espn, sleeperCount] = await Promise.all([
      session ? syncAccount(env, viewerId) : 0,
      sleeper ? syncSleeper(env, viewerId) : 0,
    ])
    return espn + sleeperCount
  }),
)

export interface SleeperConnection {
  username: string
  status: 'ok' | 'error'
  lastError: string | null
  syncedAt: string | null
}

export const getSleeperConnection = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SleeperConnection | null> => {
    if (!(await sessionViewer())) return null
    return withViewer(async ({ db, viewerId }) => {
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
    })
  },
)

/** Connect Sleeper by username: public, so nothing secret is kept. */
export const connectSleeper = createServerFn({ method: 'POST' })
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
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }): Promise<SleeperConnection> => {
      const user = await sleeperUser(data.username).catch(() => null)
      if (!user?.user_id)
        throw new Error('Sleeper has no user by that name. Check the spelling.')
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
    }),
  )

/** Forget the Sleeper account and its leagues. */
export const disconnectSleeper = createServerFn({ method: 'POST' }).handler(
  () =>
    withViewer(async ({ db, viewerId }) => {
      await db
        .delete(fantasyLeagues)
        .where(
          and(
            eq(fantasyLeagues.viewerId, viewerId),
            eq(fantasyLeagues.provider, 'sleeper'),
          ),
        )
      await db
        .delete(sleeperAccounts)
        .where(eq(sleeperAccounts.viewerId, viewerId))
    }),
)

/** Add a league from its ESPN URL (for one discovery missed). */
export const addFantasyLeague = createServerFn({ method: 'POST' })
  .validator((data: { url: string }) =>
    z.object({ url: z.string().trim().max(500) }).parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }) => {
      const sleeperId = /sleeper\.(?:com|app)\/leagues\/(\d+)/.exec(
        data.url,
      )?.[1]
      if (sleeperId) {
        const account = await db
          .select()
          .from(sleeperAccounts)
          .where(eq(sleeperAccounts.viewerId, viewerId))
          .get()
        if (!account) throw new Error('Connect Sleeper first.')
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
        throw new Error(
          'Paste the league’s URL from fantasy.espn.com (with leagueId= in it) or sleeper.com/leagues/….',
        )
      }
      const env = getCloudflareEnv()
      const session = await loadSession(env, viewerId)
      if (!session) throw new Error('Connect ESPN first.')
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
        throw new Error(
          error instanceof EspnError && error.status === 404
            ? 'ESPN has no such league this season.'
            : 'Couldn’t read that league from ESPN.',
        )
      }
    }),
  )

export const setFantasyLeagueEnabled = createServerFn({ method: 'POST' })
  .validator((data: { id: string; enabled: boolean }) =>
    z.object({ id: z.string().max(300), enabled: z.boolean() }).parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }) => {
      await db
        .update(fantasyLeagues)
        .set({ enabled: data.enabled })
        .where(
          and(
            eq(fantasyLeagues.id, data.id),
            eq(fantasyLeagues.viewerId, viewerId),
          ),
        )
    }),
  )

/** Save the Viewer's order for their leagues (ids, first to last). */
export const reorderFantasyLeagues = createServerFn({ method: 'POST' })
  .validator((data: { ids: Array<string> }) =>
    z.object({ ids: z.array(z.string().max(300)).max(60) }).parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }) => {
      for (const [position, id] of data.ids.entries())
        await db
          .update(fantasyLeagues)
          .set({ position })
          .where(
            and(
              eq(fantasyLeagues.id, id),
              eq(fantasyLeagues.viewerId, viewerId),
            ),
          )
    }),
  )

/** The race on a Matchup sheet: this period's score points, oldest first. */
export const getMatchupRace = createServerFn({ method: 'GET' })
  .validator((data: { leagueId: string }) =>
    z.object({ leagueId: z.string().max(300) }).parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }): Promise<Array<RacePoint>> => {
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
    }),
  )

export const getFantasy = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<FantasyLeagueView>> => {
    if (!(await sessionViewer())) return []
    return withViewer(async ({ db, viewerId }) => {
      const rows = await db
        .select()
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
      return rows.map((r) => ({
        id: r.id,
        sport: r.sport,
        provider: r.provider,
        name: r.name,
        teamName: r.teamName,
        enabled: r.enabled,
        lastError: r.lastError,
        updatedAt: r.updatedAt,
        matchup: r.matchup ?? null,
      }))
    })
  },
)
