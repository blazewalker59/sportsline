/** MLB Source adapter: MLB StatsAPI (statsapi.mlb.com). */

import {
  parseFeed,
  parsePlayerOverview,
  parseRoster,
  parseSchedule,
} from './parse'
import type {
  MlbFeed,
  MlbPeople,
  MlbPlayerStats,
  MlbSchedule,
  MlbTeams,
} from './feed'
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
  async teamSchedule(team) {
    // A season is a calendar year; before spring training, show the last.
    const now = new Date()
    const season = now.getUTCFullYear() - (now.getUTCMonth() < 2 ? 1 : 0)
    const schedule = await getJson<MlbSchedule>(
      `${BASE}/v1/schedule?sportId=1&teamId=${encodeURIComponent(team.sourceId)}&season=${season}&gameType=R,F,D,L,W&hydrate=team`,
    )
    return parseSchedule(schedule)
  },
  async playerOverview(sourceId) {
    const season = new Date().getUTCFullYear()
    const r = await getJson<MlbPlayerStats>(
      `${BASE}/v1/people/${encodeURIComponent(sourceId)}?hydrate=stats(group=[hitting,pitching],type=[season,gameLog],season=${season})`,
    )
    return parsePlayerOverview(r)
  },
}
