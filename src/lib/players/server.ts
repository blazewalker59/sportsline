/** A Player's page: who they are and the Plays naming them, newest first. */

import { createServerFn } from '@tanstack/react-start'
import { aliasedTable, and, desc, eq, inArray, lt } from 'drizzle-orm'
import { z } from 'zod'
import { teamRef } from './cards'
import type { TeamRef, TimelineItem } from '@/lib/model/timeline'
import type { League } from '@/lib/model/types'
import { requireViewer } from '@/lib/viewer/session'
import { getDb } from '@/lib/db'
import {
  games,
  itemPlayers,
  players,
  teams,
  timelineItems,
} from '@/lib/db/schema'
import { toTimelineItem } from '@/lib/live/rows'

const PAGE_SIZE = 50

export interface PlayerProfile {
  id: string
  name: string
  league: League
  position: string | null
  headshotUrl: string | null
  team: (TeamRef & { name: string }) | null
}

export interface PlayerPage {
  player: PlayerProfile
  items: Array<TimelineItem>
  /** Pass as `before` for the next page; null at the end. */
  nextBefore: string | null
}

export const getPlayerPage = createServerFn({ method: 'GET' })
  .validator((data: { playerId: string; before?: string }) =>
    z
      .object({
        playerId: z.string().min(1).max(200),
        before: z.string().max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<PlayerPage | null> => {
    await requireViewer()
    const db = getDb()
    const row = await db
      .select({ player: players, team: teams })
      .from(players)
      .leftJoin(teams, eq(teams.id, players.teamId))
      .where(eq(players.id, data.playerId))
      .get()
    if (!row) return null

    const t = timelineItems
    const away = aliasedTable(teams, 'away')
    const home = aliasedTable(teams, 'home')
    const rows = await db
      .select({
        item: t,
        ranks: { away: games.awayRank, home: games.homeRank },
        away,
        home,
      })
      .from(t)
      .innerJoin(games, eq(games.id, t.gameId))
      .innerJoin(away, eq(away.id, t.awayTeamId))
      .innerJoin(home, eq(home.id, t.homeTeamId))
      .where(
        and(
          inArray(
            t.id,
            db
              .select({ id: itemPlayers.itemId })
              .from(itemPlayers)
              .where(eq(itemPlayers.playerId, data.playerId)),
          ),
          data.before ? lt(t.occurredAt, data.before) : undefined,
        ),
      )
      .orderBy(desc(t.occurredAt), desc(t.sequence))
      .limit(PAGE_SIZE + 1)
    const page = rows.slice(0, PAGE_SIZE)

    return {
      player: {
        id: row.player.id,
        name: row.player.name,
        league: row.player.league,
        position: row.player.position,
        headshotUrl: row.player.headshotUrl,
        team: row.team ? teamRef(row.team) : null,
      },
      items: page.map((r) =>
        toTimelineItem(
          r.item,
          teamRef(r.away, r.ranks.away),
          teamRef(r.home, r.ranks.home),
        ),
      ),
      nextBefore:
        rows.length > PAGE_SIZE ? (page.at(-1)?.item.occurredAt ?? null) : null,
    }
  })
