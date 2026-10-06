/**
 * Sharp picks over HTTP (docs/adr/0006): the latest slate, and every pick
 * for the track record. Signed-in Viewers only.
 */

import { createServerFn } from '@tanstack/react-start'
import { desc, eq, lte } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { sharpPicks } from '@/lib/db/schema'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { requireViewer } from '@/lib/viewer/session'

export type SharpPick = typeof sharpPicks.$inferSelect

/** Today's slate, or the latest one before it (before 10am, yesterday's). */
export const getSharpSlate = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ day: string; picks: Array<SharpPick> } | null> => {
    await requireViewer()
    const db = getDb()
    const latest = await db
      .select({ day: sharpPicks.day })
      .from(sharpPicks)
      .where(lte(sharpPicks.day, sportsDayOf(new Date())))
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
  },
)

/** Every pick so far, compactly, for the record (built on the device). */
export const getSharpHistory = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireViewer()
    return getDb()
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
  },
)
