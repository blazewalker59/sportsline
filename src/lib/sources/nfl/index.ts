/** NFL Source adapter: ESPN's public site and core APIs. */

import { fetchWithRetry, mapPool } from '../pool'
import { parseGame, parseRoster, parseScoreboard } from './parse'
import type {
  NflCorePlays,
  NflRoster,
  NflScoreboard,
  NflSummary,
  NflTeams,
} from './feed'
import type { SourceAdapter } from '@/lib/model/types'

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl'

/** Roster calls in flight at once: a burst of every team gets rate-limited. */
const ROSTER_CONCURRENCY = 6

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`)
  return (await res.json()) as T
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
    const id = encodeURIComponent(sourceGameId)
    const [summary, plays] = await Promise.all([
      getJson<NflSummary>(`${SITE}/summary?event=${id}`),
      getJson<NflCorePlays>(
        `${CORE}/events/${id}/competitions/${id}/plays?limit=500`,
      ),
    ])
    return parseGame(summary, plays)
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
}
