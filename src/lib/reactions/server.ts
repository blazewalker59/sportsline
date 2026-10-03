/** Reactions over HTTP: a Sports Day's tallies, and setting your own. */

import { createServerFn } from '@tanstack/react-start'
import { aliasedTable, and, desc, eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { REACTIONS, tally } from './model'
import type { ItemReactions, Reaction } from './model'
import type { TimelineItem } from '@/lib/model/timeline'
import { teamColors } from '@/lib/brand/teamColors'
import { toTimelineItem } from '@/lib/live/rows'
import { getDb } from '@/lib/db'
import { games, reactions, teams, timelineItems } from '@/lib/db/schema'
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

const PAGE_SIZE = 50

export interface MyReaction {
  item: TimelineItem
  emoji: Reaction
  reactedAt: string
}

export interface MyReactionsPage {
  reactions: Array<MyReaction>
  /** Pass as `before` for the next page; null at the end. */
  nextBefore: string | null
}

/** The Viewer's own Reactions, newest first, with the Plays they're on. */
export const getMyReactions = createServerFn({ method: 'GET' })
  .validator((data: { before?: string }) =>
    z.object({ before: z.string().max(40).optional() }).parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }): Promise<MyReactionsPage> => {
      const away = aliasedTable(teams, 'away')
      const home = aliasedTable(teams, 'home')
      const rows = await db
        .select({
          emoji: reactions.emoji,
          reactedAt: reactions.createdAt,
          item: timelineItems,
          ranks: { away: games.awayRank, home: games.homeRank },
          away,
          home,
        })
        .from(reactions)
        .innerJoin(timelineItems, eq(timelineItems.id, reactions.itemId))
        .innerJoin(games, eq(games.id, timelineItems.gameId))
        .innerJoin(away, eq(away.id, timelineItems.awayTeamId))
        .innerJoin(home, eq(home.id, timelineItems.homeTeamId))
        .where(
          and(
            eq(reactions.viewerId, viewerId),
            data.before ? lt(reactions.createdAt, data.before) : undefined,
          ),
        )
        .orderBy(desc(reactions.createdAt))
        .limit(PAGE_SIZE + 1)
      const page = rows.slice(0, PAGE_SIZE)
      const ref = (t: typeof teams.$inferSelect, rank: number | null) => ({
        id: t.id,
        abbreviation: t.abbreviation,
        logoUrl: t.logoUrl,
        colors: teamColors(t.league, t.name),
        rank,
      })
      return {
        reactions: page.map((r) => ({
          item: toTimelineItem(
            r.item,
            ref(r.away, r.ranks.away),
            ref(r.home, r.ranks.home),
          ),
          emoji: r.emoji as Reaction,
          reactedAt: r.reactedAt,
        })),
        nextBefore:
          rows.length > PAGE_SIZE ? (page.at(-1)?.reactedAt ?? null) : null,
      }
    }),
  )
