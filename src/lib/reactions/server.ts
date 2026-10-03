/** Reactions over HTTP: a Sports Day's tallies, and setting your own. */

import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { REACTIONS, tally } from './model'
import type { ItemReactions } from './model'
import { getDb } from '@/lib/db'
import { reactions, timelineItems } from '@/lib/db/schema'
import { sessionViewer, withViewer } from '@/lib/viewer/session'

const SPORTS_DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Every Reaction on a Sports Day's items, tallied for the current Viewer. */
export const getReactions = createServerFn({ method: 'GET' })
  .validator((data: { sportsDay: string }) =>
    z.object({ sportsDay: SPORTS_DAY }).parse(data),
  )
  .handler(async ({ data }): Promise<Record<string, ItemReactions>> => {
    const viewer = await sessionViewer()
    const rows = await getDb()
      .select({
        itemId: reactions.itemId,
        viewerId: reactions.viewerId,
        emoji: reactions.emoji,
      })
      .from(reactions)
      .innerJoin(timelineItems, eq(timelineItems.id, reactions.itemId))
      .where(eq(timelineItems.sportsDay, data.sportsDay))
    return tally(rows, viewer?.id ?? null)
  })

/** React to a Play (replacing your earlier Reaction), or clear it with null. */
export const setReaction = createServerFn({ method: 'POST' })
  .validator((data: { itemId: string; emoji: string | null }) =>
    z
      .object({
        itemId: z.string().min(1).max(200),
        emoji: z.enum(REACTIONS).nullable(),
      })
      .parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }) => {
      if (data.emoji === null) {
        await db
          .delete(reactions)
          .where(
            and(
              eq(reactions.itemId, data.itemId),
              eq(reactions.viewerId, viewerId),
            ),
          )
        return
      }
      await db
        .insert(reactions)
        .values({
          itemId: data.itemId,
          viewerId,
          emoji: data.emoji,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: [reactions.itemId, reactions.viewerId],
          set: { emoji: data.emoji },
        })
    }),
  )
