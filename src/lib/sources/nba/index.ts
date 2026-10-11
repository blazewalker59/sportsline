/** NBA Source adapter: ESPN's public site API. */

import { fetchTeamSchedule, parseScoreboard } from '../espn/common'
import { ROSTER_CONCURRENCY, getJson as jsonFrom, mapPool } from '../pool'
import { espnAthleteOverview } from '../espn/athlete'
import { parseGame, parseRoster } from './parse'
import type { NbaRoster, NbaSummary } from './feed'
import type { EspnScoreboard, EspnTeams } from '../espn/common'
import type { SourceAdapter } from '@/lib/model/types'

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
const getJson = jsonFrom('ESPN')

export const nbaAdapter: SourceAdapter = {
  league: 'nba',
  source: 'espn-nba',
  async schedule(sportsDay) {
    const scoreboard = await getJson<EspnScoreboard>(
      `${SITE}/scoreboard?dates=${sportsDay.replaceAll('-', '')}`,
    )
    return parseScoreboard(scoreboard, 'nba')
  },
  async snapshot(sourceGameId) {
    return parseGame(
      await getJson<NbaSummary>(
        `${SITE}/summary?event=${encodeURIComponent(sourceGameId)}`,
      ),
    )
  },
  async roster() {
    const teams = await getJson<EspnTeams>(`${SITE}/teams`)
    const ids = (teams.sports?.[0]?.leagues?.[0]?.teams ?? []).map(
      (t) => t.team.id,
    )
    const rosters = await mapPool(ids, ROSTER_CONCURRENCY, async (teamId) => ({
      teamId,
      roster: await getJson<NbaRoster>(`${SITE}/teams/${teamId}/roster`),
    }))
    return parseRoster(teams, rosters)
  },
  teamSchedule(team) {
    return fetchTeamSchedule(SITE, team.sourceId, 'nba', getJson)
  },
  playerOverview(sourceId, teamSourceId) {
    return espnAthleteOverview(
      'basketball/nba',
      sourceId,
      teamSourceId,
      getJson,
    )
  },
}
