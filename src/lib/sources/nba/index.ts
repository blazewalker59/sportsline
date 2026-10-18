/** NBA Source adapter: ESPN's public site API. */

import { espnRosters, fetchTeamSchedule, parseScoreboard } from '../espn/common'
import { LIVE_POLL, getJson as jsonFrom } from '../pool'
import { espnAthleteOverview } from '../espn/athlete'
import { parseGame, parseRoster } from './parse'
import type { NbaRoster, NbaSummary } from './feed'
import type { EspnScoreboard } from '../espn/common'
import type { SourceAdapter } from '@/lib/model/types'

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
const getJson = jsonFrom('ESPN')
const pollJson = jsonFrom('ESPN', LIVE_POLL)

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
      await pollJson<NbaSummary>(
        `${SITE}/summary?event=${encodeURIComponent(sourceGameId)}`,
      ),
    )
  },
  async roster() {
    const { teams, rosters } = await espnRosters<NbaRoster>(SITE, getJson)
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
