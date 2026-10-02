/** MLB Source adapter: MLB StatsAPI (statsapi.mlb.com). */

import { parseFeed, parseRoster, parseSchedule } from './parse'
import type { MlbFeed, MlbPeople, MlbSchedule, MlbTeams } from './feed'
import type { SourceAdapter } from '@/lib/model/types'

const BASE = 'https://statsapi.mlb.com/api'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`MLB StatsAPI ${res.status} for ${url}`)
  return (await res.json()) as T
}

export const mlbAdapter: SourceAdapter = {
  league: 'mlb',
  source: 'mlb-statsapi',
  async schedule(sportsDay) {
    const schedule = await getJson<MlbSchedule>(
      `${BASE}/v1/schedule?sportId=1&date=${sportsDay}&hydrate=team`,
    )
    return parseSchedule(schedule)
  },
  async snapshot(sourceGameId) {
    const feed = await getJson<MlbFeed>(
      `${BASE}/v1.1/game/${encodeURIComponent(sourceGameId)}/feed/live`,
    )
    return parseFeed(feed)
  },
  async roster(season) {
    const [teams, people] = await Promise.all([
      getJson<MlbTeams>(`${BASE}/v1/teams?sportId=1&season=${season}`),
      getJson<MlbPeople>(`${BASE}/v1/sports/1/players?season=${season}`),
    ])
    return parseRoster(teams, people)
  },
}
