/**
 * Team page lookups that run on the server only: Source ids already known,
 * and opening a Game that isn't stored yet.
 */

import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from '@/lib/db'
import type { League } from '@/lib/model/types'
import { getCloudflareEnv, getDb } from '@/lib/db'
import { sourceIds } from '@/lib/db/schema'
import { LEAGUES } from '@/lib/model/types'
import { syncLeague } from '@/lib/live/schedule'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'
import { sourceFor } from '@/lib/sources'
import { BACKFILL_DAYS } from '@/lib/timeline/days'

/** Sportsline ids for Source ids, for those already known (never creates). */
export async function knownIds(
  db: Database,
  entity: 'team' | 'game',
  source: string,
  ids: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(ids)]
  // D1 binds at most 100 parameters a statement.
  for (let i = 0; i < unique.length; i += 90) {
    const rows = await db
      .select({ sourceId: sourceIds.sourceId, id: sourceIds.internalId })
      .from(sourceIds)
      .where(
        and(
          eq(sourceIds.entity, entity),
          eq(sourceIds.source, source),
          inArray(sourceIds.sourceId, unique.slice(i, i + 90)),
        ),
      )
    for (const r of rows) out.set(r.sourceId, r.id)
  }
  return out
}

/** How far ahead of today a Team page may open a Game's day. */
const OPEN_DAYS_AHEAD = 3

/** A (League, Sports Day) synced this recently isn't synced again. */
export const RESYNC_AFTER_MS = 60_000

/**
 * When each (League, Sports Day) was last synced for a Team page, and that
 * sync, so a burst of opens (or a Game the Source doesn't list on that
 * day) costs one schedule fetch a minute. Per isolate: that bounds the
 * Source calls without a table or a hop through the Scheduler, and another
 * isolate syncing the same day once more is harmless.
 */
const recentSyncs = new Map<string, { at: number; done: Promise<void> }>()

function syncOnce(league: League, sportsDay: string, now: Date): Promise<void> {
  const key = `${league}:${sportsDay}`
  const recent = recentSyncs.get(key)
  if (recent && now.getTime() - recent.at < RESYNC_AFTER_MS) return recent.done
  for (const [k, v] of recentSyncs)
    if (now.getTime() - v.at >= RESYNC_AFTER_MS) recentSyncs.delete(k)
  const done = syncLeague(getCloudflareEnv(), league, sportsDay, now)
  // A failed sync is still a recent one: the next open within the minute
  // finds nothing rather than trying the Source again.
  recentSyncs.set(key, { at: now.getTime(), done: done.catch(() => {}) })
  return done
}

export const OpenTeamGameInput = z.object({
  league: z.enum(LEAGUES),
  // Every Source numbers its Games.
  sourceGameId: z.string().regex(/^\d{1,20}$/),
  sportsDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/**
 * Open a Game from a Team page that isn't stored yet: sync its League's
 * schedule for that day (storing the Game and backfilling it if it has
 * finished), then return its id. Only as far back as a past Sports Day can
 * be backfilled (BACKFILL_DAYS), and a few days ahead.
 */
export async function openGame(
  data: z.infer<typeof OpenTeamGameInput>,
  now: Date,
): Promise<{ gameId: string } | null> {
  const today = sportsDayOf(now)
  if (
    data.sportsDay < shiftSportsDay(today, -BACKFILL_DAYS) ||
    data.sportsDay > shiftSportsDay(today, OPEN_DAYS_AHEAD)
  ) {
    return null
  }
  const db = getDb()
  const source = sourceFor(data.league).source
  const find = async () =>
    (await knownIds(db, 'game', source, [data.sourceGameId])).get(
      data.sourceGameId,
    ) ?? null
  let gameId = await find()
  if (!gameId) {
    await syncOnce(data.league, data.sportsDay, now)
    gameId = await find()
  }
  return gameId ? { gameId } : null
}
