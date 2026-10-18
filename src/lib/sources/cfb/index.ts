/**
 * College football Source adapter: ESPN's site and core APIs, the same
 * shapes as the NFL's. Only part of FBS is covered (CONTEXT.md, "League"):
 * games involving a team from a COVERED_CONFERENCES conference, a
 * COVERED_TEAMS independent or an AP Top 25 team, whoever the opponent is.
 */

import { espnRosters, fetchTeamSchedule, top25 } from '../espn/common'
import { parseRoster, parseScoreboard } from '../nfl/parse'
import { footballSnapshot } from '../nfl'
import { getJson as jsonFrom } from '../pool'
import { seasonYear } from '../common'
import { espnAthleteOverview } from '../espn/athlete'
import type { NflRoster } from '../nfl/feed'
import type { EspnScoreboard } from '../espn/common'
import type { SourceAdapter } from '@/lib/model/types'

const SITE =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football'
const CORE =
  'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football'

/** ESPN group ids: ACC, Big 12, Big Ten, SEC. */
const COVERED_CONFERENCES: ReadonlySet<string> = new Set(['1', '4', '5', '8'])
/** Independents covered on their own: Notre Dame. */
const COVERED_TEAMS: ReadonlySet<string> = new Set(['87'])
/** ESPN's FBS group, for the scoreboard. */
const FBS = '80'
const getJson = jsonFrom('ESPN')

/** Does this game involve a covered team? */
export function isCovered(
  event: NonNullable<EspnScoreboard['events']>[number],
): boolean {
  return (event.competitions?.[0]?.competitors ?? []).some(
    (c) =>
      top25(c) !== null ||
      COVERED_TEAMS.has(c.team.id) ||
      (c.team.conferenceId !== undefined &&
        COVERED_CONFERENCES.has(c.team.conferenceId)),
  )
}

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
 * The covered teams' ESPN ids, from the season's conference standings
 * (ESPN's core API, which lists conference members, refuses Workers).
 */
async function coveredTeamIds(): Promise<Array<string>> {
  const season = cfbSeason(new Date())
  const lists = await Promise.all(
    [...COVERED_CONFERENCES].map((group) =>
      getJson<Standings>(`${STANDINGS}?group=${group}&season=${season}`),
    ),
  )
  // A conference with divisions lists its teams under each division.
  const teamIds = (s: Standings): Array<string> => [
    ...(s.standings?.entries ?? []).flatMap((e) =>
      e.team?.id ? [e.team.id] : [],
    ),
    ...(s.children ?? []).flatMap(teamIds),
  ]
  return [...new Set([...lists.flatMap(teamIds), ...COVERED_TEAMS])]
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
    return parseScoreboard(
      { ...scoreboard, events: (scoreboard.events ?? []).filter(isCovered) },
      'cfb',
    )
  },
  async snapshot(sourceGameId) {
    return footballSnapshot(SITE, CORE, sourceGameId, 'cfb')
  },
  async roster() {
    const { teams, rosters } = await espnRosters<NflRoster>(
      SITE,
      getJson,
      coveredTeamIds,
    )
    return parseRoster(teams, rosters, 'cfb')
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
