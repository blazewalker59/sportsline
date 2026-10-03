/**
 * Viewer-owned data (CONTEXT.md, "Viewer"): Follows and the Read Marker.
 *
 * D1 has no row-level security, so every read and write here is scoped by
 * the session's user id via `withViewer`, the same pattern as dreamteam's
 * `withUser`.
 */

import { createServerFn } from '@tanstack/react-start'
import { and, eq, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { sessionViewer, withViewer } from './session'
import type { ViewerProfile } from './session'
import type { Database } from '@/lib/db'
import type { ViewerFollow } from '@/lib/model/timeline'
import type { League } from '@/lib/model/types'
import { getDb } from '@/lib/db'
import { follows, players, readMarkers, teams } from '@/lib/db/schema'
import { LEAGUES } from '@/lib/model/types'

export type { ViewerProfile } from './session'

/** A Follow with what the UI needs to show it. */
export interface FollowEntry {
  follow: ViewerFollow
  label: string
  detail: string | null
  league: League
  /** The Team's logo, or a Player's current Team's. */
  logoUrl: string | null
  /** A Player's headshot, when the roster sync has one. */
  headshotUrl?: string | null
}

export interface ViewerState {
  viewer: ViewerProfile | null
  follows: Array<FollowEntry>
  /** occurredAt of the newest item the Viewer had seen, if any. */
  readAt: string | null
}

const LEAGUE_LABELS: Record<League, string> = {
  mlb: 'MLB',
  nba: 'NBA',
  nfl: 'NFL',
  cfb: 'College Football',
  nhl: 'NHL',
}

async function followEntries(
  db: Database,
  viewerId: string,
): Promise<Array<FollowEntry>> {
  const rows = await db
    .select({
      kind: follows.kind,
      target: follows.target,
      teamName: teams.name,
      teamLeague: teams.league,
      teamLogo: teams.logoUrl,
      playerName: players.name,
      playerLeague: players.league,
      playerPosition: players.position,
      playerHeadshot: players.headshotUrl,
      playerTeam: sql<
        string | null
      >`(select abbreviation from teams t where t.id = ${players.teamId})`,
      playerTeamLogo: sql<
        string | null
      >`(select logo_url from teams t where t.id = ${players.teamId})`,
    })
    .from(follows)
    .leftJoin(
      teams,
      and(eq(follows.kind, 'team'), eq(teams.id, follows.target)),
    )
    .leftJoin(
      players,
      and(eq(follows.kind, 'player'), eq(players.id, follows.target)),
    )
    .where(eq(follows.viewerId, viewerId))
    .orderBy(follows.createdAt)

  return rows.flatMap((r): Array<FollowEntry> => {
    switch (r.kind) {
      case 'league': {
        const league = r.target as League
        if (!LEAGUES.includes(league)) return []
        return [
          {
            follow: { kind: 'league', league },
            label: LEAGUE_LABELS[league],
            detail: null,
            league,
            logoUrl: null,
          },
        ]
      }
      case 'team':
        if (!r.teamName || !r.teamLeague) return []
        return [
          {
            follow: { kind: 'team', teamId: r.target },
            label: r.teamName,
            detail: null,
            league: r.teamLeague,
            logoUrl: r.teamLogo,
          },
        ]
      case 'player':
        if (!r.playerName || !r.playerLeague) return []
        return [
          {
            follow: { kind: 'player', playerId: r.target },
            label: r.playerName,
            detail:
              [r.playerTeam, r.playerPosition].filter(Boolean).join(' · ') ||
              null,
            league: r.playerLeague,
            logoUrl: r.playerTeamLogo,
            headshotUrl: r.playerHeadshot,
          },
        ]
    }
  })
}

export const getViewerState = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ViewerState> => {
    const viewer = await sessionViewer()
    if (!viewer) return { viewer: null, follows: [], readAt: null }
    const db = getDb()
    const [entries, marker] = await Promise.all([
      followEntries(db, viewer.id),
      db
        .select({ readAt: readMarkers.readAt })
        .from(readMarkers)
        .where(eq(readMarkers.viewerId, viewer.id))
        .get(),
    ])
    return { viewer, follows: entries, readAt: marker?.readAt ?? null }
  },
)

const followInput = z.object({
  kind: z.enum(['league', 'team', 'player']),
  target: z.string().min(1).max(64),
  following: z.boolean(),
})

export const setFollow = createServerFn({ method: 'POST' })
  .validator((data: z.input<typeof followInput>) => followInput.parse(data))
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }): Promise<Array<FollowEntry>> => {
      if (
        data.kind === 'league' &&
        !(LEAGUES as ReadonlyArray<string>).includes(data.target)
      ) {
        throw new Error('Unknown League')
      }
      if (data.following) {
        await db
          .insert(follows)
          .values({
            viewerId,
            kind: data.kind,
            target: data.target,
            createdAt: new Date().toISOString(),
          })
          .onConflictDoNothing()
      } else {
        await db
          .delete(follows)
          .where(
            and(
              eq(follows.viewerId, viewerId),
              eq(follows.kind, data.kind),
              eq(follows.target, data.target),
            ),
          )
      }
      return followEntries(db, viewerId)
    }),
  )

const ISO = z.string().datetime({ offset: true })

/** Move the Read Marker forward (never back: a stale tab can't rewind it). */
export const markRead = createServerFn({ method: 'POST' })
  .validator((data: { readAt: string }) =>
    z.object({ readAt: ISO }).parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }) => {
      const now = new Date().toISOString()
      await db
        .insert(readMarkers)
        .values({ viewerId, readAt: data.readAt, updatedAt: now })
        .onConflictDoUpdate({
          target: readMarkers.viewerId,
          set: {
            readAt: sql`max(${readMarkers.readAt}, excluded.read_at)`,
            updatedAt: now,
          },
        })
    }),
  )

export type Followable = FollowEntry

/** Teams and Players whose name matches, for the Follows search box. */
export const searchFollowables = createServerFn({ method: 'GET' })
  .validator((data: { q: string }) =>
    z.object({ q: z.string().trim().min(2).max(60) }).parse(data),
  )
  .handler(async ({ data }): Promise<Array<Followable>> => {
    const db = getDb()
    const pattern = `%${data.q.replace(/[%_]/g, '')}%`
    const [teamRows, playerRows] = await Promise.all([
      db
        .select({
          id: teams.id,
          name: teams.name,
          abbreviation: teams.abbreviation,
          league: teams.league,
          logoUrl: teams.logoUrl,
        })
        .from(teams)
        .where(or(like(teams.name, pattern), like(teams.abbreviation, pattern)))
        .limit(8),
      db
        .select({
          id: players.id,
          name: players.name,
          league: players.league,
          position: players.position,
          headshotUrl: players.headshotUrl,
          team: sql<
            string | null
          >`(select abbreviation from teams t where t.id = ${players.teamId})`,
          teamLogo: sql<
            string | null
          >`(select logo_url from teams t where t.id = ${players.teamId})`,
        })
        .from(players)
        .where(like(players.name, pattern))
        .orderBy(sql`${players.teamId} is null`, players.name)
        .limit(15),
    ])
    return [
      ...teamRows.map((t) => ({
        follow: { kind: 'team' as const, teamId: t.id },
        label: t.name,
        detail: t.abbreviation,
        league: t.league,
        logoUrl: t.logoUrl,
      })),
      ...playerRows.map((p) => ({
        follow: { kind: 'player' as const, playerId: p.id },
        label: p.name,
        detail: [p.team, p.position].filter(Boolean).join(' · ') || null,
        league: p.league,
        logoUrl: p.teamLogo,
        headshotUrl: p.headshotUrl,
      })),
    ]
  })
