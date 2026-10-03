/** NHL Source adapter: NHL.com (api-web.nhle.com) plus its stats API. */

import { fetchWithRetry } from '../pool'
import { parseGame, parseRoster, parseSchedule } from './parse'
import type {
  NhlBios,
  NhlBoxscore,
  NhlPlayByPlay,
  NhlSchedule,
  NhlStandings,
  NhlStatsTeams,
} from './feed'
import type { SourceAdapter } from '@/lib/model/types'

const WEB = 'https://api-web.nhle.com/v1'
const STATS = 'https://api.nhle.com/stats/rest/en'

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
    return parseGame(pbp, box)
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
    return parseRoster(teams, standings, bios)
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
