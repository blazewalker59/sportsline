/**
 * Reading Sharp picks (docs/adr/0006), shared by the app's server functions
 * and Agents' tools (docs/adr/0007). Server only.
 */

import { desc, eq, lte } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { sharpPicks } from '@/lib/db/schema'

export type SharpPick = typeof sharpPicks.$inferSelect

/** The slate for `day`, or the latest one before it (before 10am, yesterday's). */
export async function slateOn(
  db: Database,
  day: string,
): Promise<{ day: string; picks: Array<SharpPick> } | null> {
  const latest = await db
    .select({ day: sharpPicks.day })
    .from(sharpPicks)
    .where(lte(sharpPicks.day, day))
    .orderBy(desc(sharpPicks.day))
    .limit(1)
    .get()
  if (!latest) return null
  const picks = await db
    .select()
    .from(sharpPicks)
    .where(eq(sharpPicks.day, latest.day))
    .orderBy(sharpPicks.rank)
  return { day: latest.day, picks }
}

/** Every pick so far, compactly, for the record. */
export function pickHistory(db: Database) {
  return db
    .select({
      id: sharpPicks.id,
      day: sharpPicks.day,
      kind: sharpPicks.kind,
      grade: sharpPicks.grade,
      price: sharpPicks.price,
      fair: sharpPicks.fair,
      closingPrice: sharpPicks.closingPrice,
      result: sharpPicks.result,
    })
    .from(sharpPicks)
    .orderBy(desc(sharpPicks.day), sharpPicks.rank)
}
