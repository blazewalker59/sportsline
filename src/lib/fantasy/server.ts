/**
 * ESPN Fantasy over HTTP for the signed-in Viewer (docs/adr/0004):
 * connect with session cookies, manage leagues, read Matchups.
 */

import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, sql } from 'drizzle-orm'
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
import type { MatchupView } from './matchup'
import type { FantasySport } from './sports'
import { getCloudflareEnv } from '@/lib/db'
import { espnAccounts, fantasyLeagues } from '@/lib/db/schema'
import { seal } from '@/lib/kalshi/vault'
import { sessionViewer, withViewer } from '@/lib/viewer/session'

export interface EspnConnection {
  status: 'ok' | 'error'
  lastError: string | null
  syncedAt: string | null
}

export interface FantasyLeagueView {
  id: string
  sport: FantasySport
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
        console.error('First ESPN sync failed', { error: String(error) }),
      )
      return { status: 'ok', lastError: null, syncedAt: now }
    }),
  )

/** Forget the cookies and every Fantasy league read with them. */
export const disconnectEspn = createServerFn({ method: 'POST' }).handler(() =>
  withViewer(async ({ db, viewerId }) => {
    await db.delete(fantasyLeagues).where(eq(fantasyLeagues.viewerId, viewerId))
    await db.delete(espnAccounts).where(eq(espnAccounts.viewerId, viewerId))
  }),
)

export const syncFantasyNow = createServerFn({ method: 'POST' }).handler(() =>
  withViewer(async ({ db, viewerId }) => {
    const env = getCloudflareEnv()
    // A manual sync also looks for new leagues.
    const session = await loadSession(env, viewerId)
    if (session) await discover(db, viewerId, session).catch(() => 0)
    return syncAccount(env, viewerId)
  }),
)

/** Add a league from its ESPN URL (for one discovery missed). */
export const addFantasyLeague = createServerFn({ method: 'POST' })
  .validator((data: { url: string }) =>
    z.object({ url: z.string().trim().max(500) }).parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }) => {
      const parsed = leagueFromUrl(data.url)
      if (!parsed) {
        throw new Error(
          'Paste the league’s URL from fantasy.espn.com (it has leagueId= in it).',
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
