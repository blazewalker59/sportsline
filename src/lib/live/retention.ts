/**
 * Retention (CONTEXT.md, "Retention"): Routine Plays are trimmed once their
 * Sports Day is more than RETENTION_DAYS old. Scoring and Notable Plays,
 * Game Milestones, Overturns, box scores and any Play someone reacted to
 * are kept for good.
 *
 * Deleted items stay remembered by their LiveGame, so a later poll of an
 * old Game never re-inserts them.
 */

import type { CloudflareEnv } from '@/lib/db'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'

export const RETENTION_DAYS = 30
/** Items per delete, and deletes per run: a day's backlog in a few runs. */
const BATCH = 500
const MAX_BATCHES = 40

/** The oldest Sports Day whose Routine Plays are still kept. */
export function retentionCutoff(now: Date): string {
  return shiftSportsDay(sportsDayOf(now), -RETENTION_DAYS)
}

/** One batch of trimmable items, oldest first (same rows for both deletes). */
const TRIMMABLE = `
  select id from timeline_items
  where sports_day < ?1
    and kind = 'play'
    and significance = 'routine'
    and not exists (select 1 from reactions r where r.item_id = timeline_items.id)
  order by sports_day, id
  limit ${BATCH}`

export const DELETE_ITEM_PLAYERS = `delete from item_players where item_id in (${TRIMMABLE})`
export const DELETE_ITEMS = `delete from timeline_items where id in (${TRIMMABLE})`

/** Trim Routine Plays past the cutoff; returns how many were deleted. */
export async function trimRoutinePlays(
  env: Pick<CloudflareEnv, 'DB'>,
  now: Date,
): Promise<number> {
  const cutoff = retentionCutoff(now)
  let total = 0
  for (let i = 0; i < MAX_BATCHES; i++) {
    // One transaction: a Play's player links go with it.
    const [, items] = await env.DB.batch([
      env.DB.prepare(DELETE_ITEM_PLAYERS).bind(cutoff),
      env.DB.prepare(DELETE_ITEMS).bind(cutoff),
    ])
    const deleted = items.meta.changes
    total += deleted
    if (deleted < BATCH) break
  }
  return total
}
