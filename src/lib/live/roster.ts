/**
 * The nightly roster sync (docs/adr/0002): refreshes every League's Teams
 * and Players from its Source so a newly called-up Player is followable the
 * same day, and keeps each Player's current Team and position.
 */

import { sql } from 'drizzle-orm'
import { chunk, resolve } from './identity'
import type { BatchItem } from 'drizzle-orm/batch'
import type { CloudflareEnv } from '@/lib/db'
import type { League } from '@/lib/model/types'
import { sourceFor } from '@/lib/sources'
import { players, teams } from '@/lib/db/schema'
import { dbFromD1 } from '@/lib/db'
import { reportError } from '@/lib/ops/errors'

/** Sync one League's roster; false (and logged) if the Source failed. */
export async function syncRoster(
  env: CloudflareEnv,
  league: League,
  now: Date,
): Promise<boolean> {
  try {
    await syncLeagueRoster(env, league, now.getUTCFullYear())
    return true
  } catch (error) {
    await reportError(env, 'roster', error, { league })
    return false
  }
}

async function syncLeagueRoster(
  env: CloudflareEnv,
  league: League,
  season: number,
): Promise<void> {
  const adapter = sourceFor(league)
  const roster = await adapter.roster(season)
  const db = dbFromD1(env.DB)

  const teamIds = await resolve(
    db,
    'team',
    adapter.source,
    league,
    roster.teams,
  )
  const playerIds = await resolve(
    db,
    'player',
    adapter.source,
    league,
    roster.players,
  )

  const statements: Array<BatchItem<'sqlite'>> = []
  for (const part of chunk(roster.teams, 20)) {
    statements.push(
      db
        .insert(teams)
        .values(
          part.map((t) => ({
            id: teamIds.get(t.sourceId)!,
            league,
            name: t.name,
            abbreviation: t.abbreviation,
            logoUrl: t.logoUrl,
          })),
        )
        .onConflictDoUpdate({
          target: teams.id,
          set: {
            name: sql`excluded.name`,
            abbreviation: sql`excluded.abbreviation`,
            logoUrl: sql`excluded.logo_url`,
          },
        }),
    )
  }
  // Six columns a row: 16 rows stay under D1's 100 bound parameters.
  for (const part of chunk(roster.players, 16)) {
    statements.push(
      db
        .insert(players)
        .values(
          part.map((p) => ({
            id: playerIds.get(p.sourceId)!,
            league,
            name: p.name,
            teamId: p.teamSourceId
              ? (teamIds.get(p.teamSourceId) ?? null)
              : null,
            position: p.position,
            headshotUrl: p.headshotUrl ?? null,
          })),
        )
        .onConflictDoUpdate({
          target: players.id,
          set: {
            name: sql`excluded.name`,
            teamId: sql`excluded.team_id`,
            position: sql`excluded.position`,
            headshotUrl: sql`excluded.headshot_url`,
          },
        }),
    )
  }
  const [first, ...rest] = statements
  if (first) await db.batch([first, ...rest])
  console.log('Roster synced', {
    league,
    teams: roster.teams.length,
    players: roster.players.length,
  })
}
