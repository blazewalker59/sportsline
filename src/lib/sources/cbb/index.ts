/**
 * Men's college basketball Source adapter: ESPN's site API, the same
 * shapes as the NBA's with two halves for four quarters. Every Division I
 * Game is on the schedule, so a Prediction can be matched to any; only
 * those someone opts into are followed live (CONTEXT.md, "Opt-in";
 * src/lib/live/schedule.ts). No rosters are read (there are some 360
 * teams): a team's Players are named from its Games' plays and box scores.
 */

import { HALVES, fetchTeamSchedule, parseScoreboard } from '../espn/common'
import { LIVE_POLL, getJson as jsonFrom } from '../pool'
import { espnAthleteOverview } from '../espn/athlete'
import { parseGame } from '../nba/parse'
import type { NbaSummary } from '../nba/feed'
import type { EspnScoreboard } from '../espn/common'
import type { SourceAdapter } from '@/lib/model/types'

const SITE =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball'
/** ESPN's Division I group, for the scoreboard. */
const DIVISION_I = '50'
const getJson = jsonFrom('ESPN')
const pollJson = jsonFrom('ESPN', LIVE_POLL)

export const cbbAdapter: SourceAdapter = {
  league: 'cbb',
  // ESPN numbers college teams apart from the pros' (and the same school's
  // football team shares its id), so a Source name of its own keeps the
  // identity mapping apart (docs/adr/0002).
  source: 'espn-cbb',
  async schedule(sportsDay) {
    const scoreboard = await getJson<EspnScoreboard>(
      `${SITE}/scoreboard?groups=${DIVISION_I}&limit=400&dates=${sportsDay.replaceAll('-', '')}`,
    )
    return parseScoreboard(scoreboard, 'cbb')
  },
  async snapshot(sourceGameId) {
    return parseGame(
      await pollJson<NbaSummary>(
        `${SITE}/summary?event=${encodeURIComponent(sourceGameId)}`,
      ),
      HALVES,
    )
  },
  roster() {
    return Promise.resolve({ teams: [], players: [] })
  },
  teamSchedule(team) {
    return fetchTeamSchedule(SITE, team.sourceId, 'cbb', getJson)
  },
  playerOverview(sourceId, teamSourceId) {
    return espnAthleteOverview(
      'basketball/mens-college-basketball',
      sourceId,
      teamSourceId,
      getJson,
    )
  },
}
