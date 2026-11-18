/** A Viewer's display settings, read on the server. Server only. */

import { eq, sql } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import type { PriceDisplay } from '@/lib/model/price'
import { viewerSettings } from '@/lib/db/schema'

/** How the Viewer wants Kalshi prices shown: cents unless they chose otherwise. */
export async function priceDisplayOf(
  db: Database,
  viewerId: string,
): Promise<PriceDisplay> {
  const row = await db
    .select({ priceDisplay: viewerSettings.priceDisplay })
    .from(viewerSettings)
    .where(eq(viewerSettings.viewerId, viewerId))
    .get()
  return row?.priceDisplay ?? 'cents'
}

/**
 * Whether the first-run Follow picker is behind the Viewer: finished,
 * skipped, or made moot by a Follow. Kept in D1 so it holds on every device.
 */
export async function firstRunDoneOf(
  db: Database,
  viewerId: string,
): Promise<boolean> {
  const row = await db
    .select({ at: viewerSettings.firstRunDoneAt })
    .from(viewerSettings)
    .where(eq(viewerSettings.viewerId, viewerId))
    .get()
  return Boolean(row?.at)
}

/** Put the first-run Follow picker behind the Viewer, for good. */
export async function markFirstRunDone(
  db: Database,
  viewerId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .insert(viewerSettings)
    .values({ viewerId, firstRunDoneAt: now })
    .onConflictDoUpdate({
      target: viewerSettings.viewerId,
      set: {
        firstRunDoneAt: sql`coalesce(${viewerSettings.firstRunDoneAt}, ${now})`,
      },
    })
}
