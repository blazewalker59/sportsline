/** NFL Source adapter: ESPN's public site and core APIs. */

import {
  LIVE_POLL,
  ROSTER_CONCURRENCY,
  getJson as jsonFrom,
  mapPool,
} from '../pool'
import { fetchTeamSchedule } from '../espn/common'
import { espnAthleteOverview } from '../espn/athlete'
import { drivePlays, parseGame, parseRoster, parseScoreboard } from './parse'
import type {
  NflCorePlays,
  NflRoster,
  NflScoreboard,
  NflSummary,
  NflTeams,
} from './feed'
import type { GameSnapshot, SourceAdapter } from '@/lib/model/types'
import type { FootballLeague } from './parse'

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl'
const getJson = jsonFrom('ESPN')
const pollJson = jsonFrom('ESPN', LIVE_POLL)

/**
 * An NFL or college game: the summary, and the core API's plays for who
 * was involved. ESPN's core API refuses Workers at times: then the
 * summary's own plays stand in, without anyone involved, rather than the
 * game going dark, and the snapshot says it fell back.
 */
export async function footballSnapshot(
  site: string,
  core: string,
  sourceGameId: string,
  league: FootballLeague = 'nfl',
): Promise<GameSnapshot> {
  const id = encodeURIComponent(sourceGameId)
  let fallback: string | undefined
  const [summary, plays] = await Promise.all([
    pollJson<NflSummary>(`${site}/summary?event=${id}`),
    pollJson<NflCorePlays>(
      `${core}/events/${id}/competitions/${id}/plays?limit=500`,
    ).catch((error: unknown) => {
      fallback = `ESPN core plays unavailable: ${error instanceof Error ? error.message : String(error)}`
      console.warn(`[source] ${fallback}`)
      return null
    }),
  ])
  const game = parseGame(summary, plays ?? drivePlays(summary), league)
  return fallback ? { ...game, fallback } : game
}

export const nflAdapter: SourceAdapter = {
  league: 'nfl',
  source: 'espn',
  async schedule(sportsDay) {
    const scoreboard = await getJson<NflScoreboard>(
      `${SITE}/scoreboard?dates=${sportsDay.replaceAll('-', '')}`,
    )
    return parseScoreboard(scoreboard)
  },
  async snapshot(sourceGameId) {
    return footballSnapshot(SITE, CORE, sourceGameId)
  },
  async roster() {
    const teams = await getJson<NflTeams>(`${SITE}/teams`)
    const ids = (teams.sports?.[0]?.leagues?.[0]?.teams ?? []).map(
      (t) => t.team.id,
    )
    const rosters = await mapPool(ids, ROSTER_CONCURRENCY, async (teamId) => ({
      teamId,
      roster: await getJson<NflRoster>(`${SITE}/teams/${teamId}/roster`),
    }))
    return parseRoster(teams, rosters)
  },
  teamSchedule(team) {
    return fetchTeamSchedule(SITE, team.sourceId, 'nfl', getJson)
  },
  playerOverview(sourceId, teamSourceId) {
    return espnAthleteOverview('football/nfl', sourceId, teamSourceId, getJson)
  },
}
