/** MLB Source adapter: MLB StatsAPI (statsapi.mlb.com). */

import { LIVE_POLL, getJson as jsonFrom } from '../pool'
import { seasonYear } from '../common'
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
const getJson = jsonFrom('MLB StatsAPI')
const pollJson = jsonFrom('MLB StatsAPI', LIVE_POLL)

/** A season is a calendar year; before March, the last one's schedule. */
export function mlbSeason(now: Date): number {
  return seasonYear(now, 2)
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
    const feed = await pollJson<MlbFeed>(
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
    const season = mlbSeason(new Date())
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
