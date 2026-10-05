/**
 * A Player's detail beyond their Plays: their season, recent games and news
 * from the Source, and their Team's Game now (or next) with their line in it.
 */

import { createServerFn } from '@tanstack/react-start'
import { aliasedTable, and, asc, eq, gte, lte, or } from 'drizzle-orm'
import { z } from 'zod'
import type { GameSummary } from '@/lib/model/timeline'
import type { PlayerOverview } from '@/lib/model/types'
import { requireViewer } from '@/lib/viewer/session'
import { getCloudflareEnv, getDb } from '@/lib/db'
import { games, players, sourceIds, teams } from '@/lib/db/schema'
import { toGameSummary } from '@/lib/live/rows'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'
import { sourceFor } from '@/lib/sources'
import { reportError } from '@/lib/ops/errors'

/** One box-score table's row for the Player: "Passing", C/ATT 18/27 … */
export interface PlayerLine {
  title: string
  columns: Array<string>
  values: Array<string | number>
}

export interface PlayerDetail {
  overview: PlayerOverview | null
  /** Their Team's Game: live now, else the next one, else today's Final. */
  game: GameSummary | null
  line: Array<PlayerLine>
}

export const getPlayerDetail = createServerFn({ method: 'GET' })
  .validator((data: { playerId: string }) =>
    z.object({ playerId: z.string().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data }): Promise<PlayerDetail | null> => {
    await requireViewer()
    const db = getDb()
    const player = await db
      .select()
      .from(players)
      .where(eq(players.id, data.playerId))
      .get()
    if (!player) return null
    const adapter = sourceFor(player.league)

    const sourceIdOf = async (entity: 'player' | 'team', id: string) =>
      (
        await db
          .select({ sourceId: sourceIds.sourceId })
          .from(sourceIds)
          .where(
            and(
              eq(sourceIds.entity, entity),
              eq(sourceIds.source, adapter.source),
              eq(sourceIds.internalId, id),
            ),
          )
          .get()
      )?.sourceId ?? null

    const overview = async () => {
      const id = await sourceIdOf('player', player.id)
      if (!id) return null
      const team = player.teamId
        ? await sourceIdOf('team', player.teamId)
        : null
      try {
        return await adapter.playerOverview(id, team)
      } catch (error) {
        // The rest of the page stands without it.
        await reportError(getCloudflareEnv(), 'source', error, {
          step: 'player-overview',
          playerId: player.id,
        })
        return null
      }
    }

    const current = async () => {
      if (!player.teamId) return null
      const today = sportsDayOf(new Date())
      const away = aliasedTable(teams, 'away')
      const home = aliasedTable(teams, 'home')
      const rows = await db
        .select({ game: games, away, home })
        .from(games)
        .innerJoin(away, eq(away.id, games.awayTeamId))
        .innerJoin(home, eq(home.id, games.homeTeamId))
        .where(
          and(
            or(
              eq(games.awayTeamId, player.teamId),
              eq(games.homeTeamId, player.teamId),
            ),
            gte(games.sportsDay, today),
            lte(games.sportsDay, shiftSportsDay(today, 10)),
          ),
        )
        .orderBy(asc(games.startsAt))
      const pick =
        rows.find(
          (r) => r.game.status === 'live' || r.game.status === 'delayed',
        ) ??
        rows.find((r) => r.game.status === 'scheduled') ??
        [...rows].reverse().find((r) => r.game.status === 'final')
      if (!pick) return null
      const line = (pick.game.box?.tables ?? []).flatMap((t) =>
        t.rows
          .filter((r) => r.player.id === player.id)
          .map((r) => ({
            title: t.title,
            columns: t.columns,
            values: r.values,
          })),
      )
      return {
        game: toGameSummary(pick.game, pick.away, pick.home),
        line,
      }
    }

    const [o, c] = await Promise.all([overview(), current()])
    // Some Sources name opponents in full ("Minnesota Twins"): abbreviate.
    if (o?.recent.some((g) => g.opponent.length > 4)) {
      const abbrevs = new Map(
        (
          await db
            .select({ name: teams.name, abbreviation: teams.abbreviation })
            .from(teams)
            .where(eq(teams.league, player.league))
        ).map((t) => [t.name, t.abbreviation]),
      )
      for (const g of o.recent)
        g.opponent = abbrevs.get(g.opponent) ?? g.opponent
    }
    return { overview: o, game: c?.game ?? null, line: c?.line ?? [] }
  })
