/** A Viewer's display settings, read on the server. Server only. */

import { eq } from 'drizzle-orm'
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
