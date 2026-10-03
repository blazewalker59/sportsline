/** NBA Source adapter: ESPN's public site API. */

import { fetchTeamSchedule, parseScoreboard } from '../espn/common'
import { fetchWithRetry, mapPool } from '../pool'
import { parseGame, parseRoster } from './parse'
import type { NbaRoster, NbaSummary } from './feed'
import type { NflScoreboard, NflTeams } from '../nfl/feed'
import type { SourceAdapter } from '@/lib/model/types'

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'

/** Roster calls in flight at once: a burst of every team gets rate-limited. */
const ROSTER_CONCURRENCY = 6

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`)
  return (await res.json()) as T
}

export const nbaAdapter: SourceAdapter = {
  league: 'nba',
  source: 'espn-nba',
  async schedule(sportsDay) {
    const scoreboard = await getJson<NflScoreboard>(
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
    const teams = await getJson<NflTeams>(`${SITE}/teams`)
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
}
