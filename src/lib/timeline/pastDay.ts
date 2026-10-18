/**
 * Loading a past Sports Day that was never stored: sync each League's
 * schedule for it once. A League whose Source answered with no Games that
 * day is remembered in `empty_days` (shared by every isolate, unlike a
 * memo in memory) so reopening the day doesn't ask the Source again; one
 * whose Source failed is tried again next time.
 */

import { and, eq, gte, sql } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import type { League } from '@/lib/model/types'
import { emptyDays, games } from '@/lib/db/schema'

/** A Source's empty answer is trusted this long (a past day rarely changes). */
export const EMPTY_DAY_MS = 24 * 3_600_000

export interface PastDaySync {
  /** Games the day has once synced. */
  games: number
  /** Whether any League's schedule was fetched just now. */
  synced: boolean
  /** Why each failed League's sync failed. */
  failures: Array<unknown>
}

export async function syncPastDay(
  db: Database,
  sportsDay: string,
  now: Date,
  leagues: ReadonlyArray<League>,
  syncLeague: (league: League) => Promise<void>,
): Promise<PastDaySync> {
  const stored = await gamesOn(db, sportsDay)
  const total = [...stored.values()].reduce((a, b) => a + b, 0)
  if (total > 0) return { games: total, synced: false, failures: [] }

  const since = new Date(now.getTime() - EMPTY_DAY_MS).toISOString()
  const known = new Set(
    (
      await db
        .select({ league: emptyDays.league })
        .from(emptyDays)
        .where(
          and(
            eq(emptyDays.sportsDay, sportsDay),
            gte(emptyDays.checkedAt, since),
          ),
        )
    ).map((r) => r.league),
  )
  const pending = leagues.filter((l) => !known.has(l))
  if (pending.length === 0) return { games: 0, synced: false, failures: [] }

  const results = await Promise.allSettled(pending.map(syncLeague))
  const after = await gamesOn(db, sportsDay)
  const empty = pending.filter(
    (l, i) => results[i].status === 'fulfilled' && !after.get(l),
  )
  if (empty.length > 0) {
    const checkedAt = now.toISOString()
    await db
      .insert(emptyDays)
      .values(empty.map((league) => ({ league, sportsDay, checkedAt })))
      .onConflictDoUpdate({
        target: [emptyDays.league, emptyDays.sportsDay],
        set: { checkedAt },
      })
  }
  return {
    games: [...after.values()].reduce((a, b) => a + b, 0),
    synced: true,
    failures: results.flatMap((r) =>
      r.status === 'rejected' ? [r.reason] : [],
    ),
  }
}

async function gamesOn(
  db: Database,
  sportsDay: string,
): Promise<Map<League, number>> {
  const rows = await db
    .select({ league: games.league, n: sql<number>`count(*)` })
    .from(games)
    .where(eq(games.sportsDay, sportsDay))
    .groupBy(games.league)
  return new Map(rows.map((r) => [r.league, r.n]))
}
