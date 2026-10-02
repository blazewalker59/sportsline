/** NHL Source adapter: NHL.com (api-web.nhle.com) plus its stats API. */

import { parseGame, parseRoster, parseSchedule } from './parse'
import type {
  NhlBoxscore,
  NhlPlayByPlay,
  NhlRoster,
  NhlSchedule,
  NhlStandings,
  NhlStatsTeams,
} from './feed'
import type { SourceAdapter } from '@/lib/model/types'

const WEB = 'https://api-web.nhle.com/v1'
const STATS = 'https://api.nhle.com/stats/rest/en'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
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
    const [teams, standings] = await Promise.all([
      getJson<NhlStatsTeams>(`${STATS}/team`),
      getJson<NhlStandings>(`${WEB}/standings/now`),
    ])
    const abbrevs = (standings.standings ?? []).flatMap((s) =>
      s.teamAbbrev?.default ? [s.teamAbbrev.default] : [],
    )
    const rosters = await Promise.all(
      abbrevs.map(async (abbrev) => ({
        abbrev,
        roster: await getJson<NhlRoster>(`${WEB}/roster/${abbrev}/current`),
      })),
    )
    return parseRoster(teams, standings, rosters)
  },
}
