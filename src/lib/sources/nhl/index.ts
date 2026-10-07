/** NHL Source adapter: NHL.com (api-web.nhle.com) plus its stats API. */

import { fetchWithRetry } from '../pool'
import {
  parseClubSchedule,
  parseGame,
  parsePlayerLanding,
  parseRoster,
  parseSchedule,
} from './parse'
import type {
  NhlBios,
  NhlBoxscore,
  NhlClubSchedule,
  NhlPlayByPlay,
  NhlPlayerLanding,
  NhlSchedule,
  NhlStandings,
  NhlStatsTeams,
} from './feed'
import type { SourceAdapter } from '@/lib/model/types'

const WEB = 'https://api-web.nhle.com/v1'
const STATS = 'https://api.nhle.com/stats/rest/en'
/**
 * Each poll is two calls (Plays and box score), and NHL.com answers 429 to
 * Workers polling a full slate every 5s; 10s halves that and stays within
 * docs/adr/0001's 5–10s behind.
 */
const LIVE_POLL_SECONDS = 10

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`NHL ${res.status} for ${url}`)
  return (await res.json()) as T
}

export const nhlAdapter: SourceAdapter = {
  league: 'nhl',
  source: 'nhl-web',
  async schedule(sportsDay) {
    return parseSchedule(
      await getJson<NhlSchedule>(`${WEB}/schedule/${sportsDay}`),
      sportsDay,
    )
  },
  async snapshot(sourceGameId) {
    const id = encodeURIComponent(sourceGameId)
    const [pbp, box] = await Promise.all([
      getJson<NhlPlayByPlay>(`${WEB}/gamecenter/${id}/play-by-play`),
      // The box score is a nicety; a failure here must not stop the Plays.
      getJson<NhlBoxscore>(`${WEB}/gamecenter/${id}/boxscore`).catch(
        () => null,
      ),
    ])
    return { ...parseGame(pbp, box), pollHintSeconds: LIVE_POLL_SECONDS }
  },
  async roster() {
    // Season bios list every player with their current team in a few calls;
    // the per-team roster endpoint is rate-limited from Workers.
    const seasons = nhlSeasons(new Date())
    const [teams, standings, ...bios] = await Promise.all([
      getJson<NhlStatsTeams>(`${STATS}/team`),
      getJson<NhlStandings>(`${WEB}/standings/now`),
      ...seasons.flatMap((season) =>
        (['skater', 'goalie'] as const).map((kind) =>
          getJson<NhlBios>(
            `${STATS}/${kind}/bios?limit=-1&cayenneExp=seasonId=${season}`,
          ),
        ),
      ),
    ])
    return parseRoster(teams, standings, bios, seasons[0])
  },
  async teamSchedule(team) {
    return parseClubSchedule(
      await getJson<NhlClubSchedule>(
        `${WEB}/club-schedule-season/${encodeURIComponent(team.abbreviation)}/now`,
      ),
    )
  },
  async playerOverview(sourceId) {
    return parsePlayerLanding(
      await getJson<NhlPlayerLanding>(
        `${WEB}/player/${encodeURIComponent(sourceId)}/landing`,
      ),
    )
  },
}

/**
 * This season's and last season's ids ("20262027"): a season's preseason
 * starts in September and its playoffs run into June.
 */
export function nhlSeasons(now: Date): Array<string> {
  const start = now.getUTCFullYear() - (now.getUTCMonth() < 8 ? 1 : 0)
  return [`${start}${start + 1}`, `${start - 1}${start}`]
}
