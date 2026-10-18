/**
 * A Team's page: the Team, its season from the Source (results and what's
 * to come), and its roster. Games already stored link to their threads; an
 * older one can be opened on demand (openTeamGame), which backfills it.
 */

import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, isNotNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { OpenTeamGameInput, knownIds, openGame } from './games'
import type { Conference } from '@/lib/model/leagues'
import type { League, ScheduledGame, SourceTeam } from '@/lib/model/types'
import { viewerMiddleware } from '@/lib/viewer/middleware'
import { teamColors } from '@/lib/brand/teamColors'
import { getCloudflareEnv, getDb } from '@/lib/db'
import { games, players, sourceIds, teams } from '@/lib/db/schema'
import { sourceFor } from '@/lib/sources'
import { reportError } from '@/lib/ops/errors'

interface TeamProfile {
  id: string
  name: string
  abbreviation: string
  logoUrl: string | null
  league: League
  colors: ReturnType<typeof teamColors>
  /** College football: this week's AP rank, if ranked. */
  rank: number | null
  conference: Conference | null
  /** From the season's Finals: "10–7", or "6–2–1" in the NHL (OT losses). */
  record: string | null
}

export interface TeamGame {
  sourceGameId: string
  /** Sportsline's id when the Game is stored; null until it's opened. */
  gameId: string | null
  sportsDay: string
  startsAt: string
  status: ScheduledGame['status']
  home: boolean
  opponent: {
    /** Sportsline's id, when the opponent is known (for its page). */
    id: string | null
    name: string
    abbreviation: string
    logoUrl: string | null
    rank: number | null
  }
  score: { team: number; opponent: number }
  result: 'W' | 'L' | 'T' | 'OTL' | null
}

export interface RosterPlayer {
  id: string
  name: string
  position: string | null
  headshotUrl: string | null
}

export interface TeamPage {
  team: TeamProfile
  games: Array<TeamGame>
  roster: Array<RosterPlayer>
  /** The Source couldn't be reached: the schedule is missing, the rest isn't. */
  scheduleError: boolean
}

function resultOf(g: ScheduledGame, home: boolean): TeamGame['result'] {
  if (g.status !== 'final') return null
  const us = home ? g.score.home : g.score.away
  const them = home ? g.score.away : g.score.home
  if (us > them) return 'W'
  if (us === them) return 'T'
  return g.overtime ? 'OTL' : 'L'
}

function recordOf(
  league: League,
  played: ReadonlyArray<TeamGame>,
): string | null {
  const count = (r: TeamGame['result']) =>
    played.filter((g) => g.result === r).length
  const [w, l, t, otl] = [count('W'), count('L'), count('T'), count('OTL')]
  if (w + l + t + otl === 0) return null
  if (league === 'nhl') return `${w}–${l}–${otl}`
  return t > 0 ? `${w}–${l + otl}–${t}` : `${w}–${l + otl}`
}

export const getTeamPage = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .validator((data: { teamId: string }) =>
    z.object({ teamId: z.string().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data }): Promise<TeamPage | null> => {
    const db = getDb()
    const team = await db
      .select()
      .from(teams)
      .where(eq(teams.id, data.teamId))
      .get()
    if (!team) return null
    const adapter = sourceFor(team.league)

    const [source, roster, latest] = await Promise.all([
      db
        .select({ sourceId: sourceIds.sourceId })
        .from(sourceIds)
        .where(
          and(
            eq(sourceIds.entity, 'team'),
            eq(sourceIds.source, adapter.source),
            eq(sourceIds.internalId, team.id),
          ),
        )
        .get(),
      db
        .select({
          id: players.id,
          name: players.name,
          position: players.position,
          headshotUrl: players.headshotUrl,
        })
        .from(players)
        .where(eq(players.teamId, team.id))
        .orderBy(asc(players.position), asc(players.name)),
      // College football: the conference from the Team's latest Game.
      team.league === 'cfb'
        ? db
            .select({
              home: games.homeTeamId,
              homeConference: games.homeConference,
              awayConference: games.awayConference,
            })
            .from(games)
            .where(
              and(
                or(
                  eq(games.homeTeamId, team.id),
                  eq(games.awayTeamId, team.id),
                ),
                or(
                  isNotNull(games.homeConference),
                  isNotNull(games.awayConference),
                ),
              ),
            )
            .orderBy(desc(games.startsAt))
            .get()
        : Promise.resolve(undefined),
    ])

    let schedule: Array<ScheduledGame> = []
    let scheduleError = false
    if (source) {
      try {
        schedule = await adapter.teamSchedule({
          sourceId: source.sourceId,
          abbreviation: team.abbreviation,
        })
      } catch (error) {
        await reportError(getCloudflareEnv(), 'source', error, {
          step: 'team-schedule',
          teamId: team.id,
        })
        scheduleError = true
      }
    }
    schedule.sort((a, b) => a.startsAt.localeCompare(b.startsAt))

    const sideOf = (g: ScheduledGame): boolean =>
      g.home.sourceId === source?.sourceId
    const [gameIds, teamIds] = await Promise.all([
      knownIds(
        db,
        'game',
        adapter.source,
        schedule.map((g) => g.sourceGameId),
      ),
      knownIds(
        db,
        'team',
        adapter.source,
        schedule.map((g) => (sideOf(g) ? g.away : g.home).sourceId),
      ),
    ])
    const gameList: Array<TeamGame> = schedule.map((g) => {
      const home = sideOf(g)
      const opp: SourceTeam = home ? g.away : g.home
      return {
        sourceGameId: g.sourceGameId,
        gameId: gameIds.get(g.sourceGameId) ?? null,
        sportsDay: g.sportsDay,
        startsAt: g.startsAt,
        status: g.status,
        home,
        opponent: {
          id: teamIds.get(opp.sourceId) ?? null,
          name: opp.name,
          abbreviation: opp.abbreviation,
          logoUrl: opp.logoUrl,
          rank: opp.rank ?? null,
        },
        score: {
          team: home ? g.score.home : g.score.away,
          opponent: home ? g.score.away : g.score.home,
        },
        result: resultOf(g, home),
      }
    })

    // This week's rank: the next Game's, else the latest one's.
    const upcoming =
      schedule.find((g) => g.status !== 'final') ?? schedule.at(-1)
    const us = upcoming && (sideOf(upcoming) ? upcoming.home : upcoming.away)

    return {
      team: {
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        logoUrl: team.logoUrl,
        league: team.league,
        colors: teamColors(team.league, team.name),
        rank: us?.rank ?? null,
        conference: latest
          ? latest.home === team.id
            ? latest.homeConference
            : latest.awayConference
          : null,
        record: recordOf(team.league, gameList),
      },
      games: gameList,
      roster,
      scheduleError,
    }
  })

/**
 * Open a Game from a Team page that isn't stored yet (openGame): only as
 * far back as a past Sports Day can be backfilled, and a few days ahead.
 */
export const openTeamGame = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator(
    (data: { league: string; sourceGameId: string; sportsDay: string }) =>
      OpenTeamGameInput.parse(data),
  )
  .handler(async ({ data }): Promise<{ gameId: string } | null> => {
    return openGame(data, new Date())
  })
