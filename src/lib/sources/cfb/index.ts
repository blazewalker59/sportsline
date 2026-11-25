/**
 * College football Source adapter: ESPN's site and core APIs, the same
 * shapes as the NFL's. Only the Games someone opts into are stored or
 * followed live (CONTEXT.md, "Opt-in"; src/lib/live/schedule.ts). The
 * nightly roster is FBS's team list alone (two requests, so any team can
 * be followed); a team's Players are named from its opted-in Games' plays.
 */

import { fetchTeamSchedule, teamLogo } from '../espn/common'
import { parseScoreboard } from '../nfl/parse'
import { footballSnapshot } from '../nfl'
import { getJson as jsonFrom } from '../pool'
import { seasonYear } from '../common'
import { espnAthleteOverview } from '../espn/athlete'
import type { EspnScoreboard, EspnTeams } from '../espn/common'
import type { SourceAdapter, SourceTeam } from '@/lib/model/types'

const SITE =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football'
const CORE =
  'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football'

/** ESPN's FBS group, for the scoreboard and the standings. */
const FBS = '80'
const getJson = jsonFrom('ESPN')

/**
 * A season runs August to January: bowls and the playoff belong to the year
 * it started, which rolls over in July.
 */
export function cfbSeason(now: Date): number {
  return seasonYear(now, 6)
}

interface Standings {
  standings?: { entries?: Array<{ team?: { id?: string } }> }
  children?: Array<Standings>
}

const STANDINGS =
  'https://site.api.espn.com/apis/v2/sports/football/college-football/standings'

/**
 * FBS's teams: their ids from the season's standings (every conference and
 * the independents, in one read), their names and logos from ESPN's team
 * list (every division's, in another). ESPN's team list ignores a group.
 */
async function fbsTeams(): Promise<Array<SourceTeam>> {
  const season = cfbSeason(new Date())
  const [standings, list] = await Promise.all([
    getJson<Standings>(`${STANDINGS}?group=${FBS}&season=${season}`),
    getJson<EspnTeams>(`${SITE}/teams?limit=1000`),
  ])
  // A conference with divisions lists its teams under each division.
  const idsOf = (st: Standings): Array<string> => [
    ...(st.standings?.entries ?? []).flatMap((e) =>
      e.team?.id ? [e.team.id] : [],
    ),
    ...(st.children ?? []).flatMap(idsOf),
  ]
  const fbs = new Set(idsOf(standings))
  return (list.sports?.[0]?.leagues?.[0]?.teams ?? [])
    .filter(({ team }) => fbs.has(team.id))
    .map(({ team }) => {
      const abbreviation = team.abbreviation ?? team.id
      return {
        sourceId: team.id,
        name: team.displayName ?? abbreviation,
        abbreviation,
        logoUrl: teamLogo('cfb', abbreviation, team.id),
      }
    })
}

export const cfbAdapter: SourceAdapter = {
  league: 'cfb',
  // Not 'espn': ESPN numbers college teams separately from the NFL's, so
  // the ids overlap (8 is Detroit and Arkansas). A Source name of its own
  // keeps the identity mapping apart (docs/adr/0002).
  source: 'espn-cfb',
  async schedule(sportsDay) {
    const scoreboard = await getJson<EspnScoreboard>(
      `${SITE}/scoreboard?groups=${FBS}&limit=300&dates=${sportsDay.replaceAll('-', '')}`,
    )
    return parseScoreboard(scoreboard, 'cfb')
  },
  async snapshot(sourceGameId) {
    return footballSnapshot(SITE, CORE, sourceGameId, 'cfb')
  },
  async roster() {
    return { teams: await fbsTeams(), players: [] }
  },
  teamSchedule(team) {
    return fetchTeamSchedule(SITE, team.sourceId, 'cfb', getJson)
  },
  playerOverview(sourceId, teamSourceId) {
    return espnAthleteOverview(
      'football/college-football',
      sourceId,
      teamSourceId,
      getJson,
    )
  },
}
