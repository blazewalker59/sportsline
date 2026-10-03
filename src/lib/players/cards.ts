/**
 * Player and Team cards for server functions. Server-only: kept apart from
 * the server-function modules so the client bundle never pulls in D1.
 */

import { eq, inArray } from 'drizzle-orm'
import type { TeamRef } from '@/lib/model/timeline'
import type { Database } from '@/lib/db'
import { teamColors } from '@/lib/brand/teamColors'
import { players, teams } from '@/lib/db/schema'

type TeamRow = typeof teams.$inferSelect

export function teamRef(t: TeamRow, rank: number | null = null) {
  return {
    id: t.id,
    abbreviation: t.abbreviation,
    logoUrl: t.logoUrl,
    name: t.name,
    colors: teamColors(t.league, t.name),
    rank,
  }
}

/** Headshots and Teams for a set of Players (Play Detail's player list). */
export async function playerCards(
  db: Database,
  ids: ReadonlyArray<string>,
): Promise<Map<string, { headshotUrl: string | null; team: TeamRef | null }>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: players.id, headshotUrl: players.headshotUrl, team: teams })
    .from(players)
    .leftJoin(teams, eq(teams.id, players.teamId))
    .where(inArray(players.id, [...ids]))
  return new Map(
    rows.map((r) => [
      r.id,
      { headshotUrl: r.headshotUrl, team: r.team ? teamRef(r.team) : null },
    ]),
  )
}
