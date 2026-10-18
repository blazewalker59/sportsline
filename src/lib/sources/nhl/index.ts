/** NHL Source adapter: NHL.com (api-web.nhle.com) plus its stats API. */

import { LIVE_POLL, getJson as jsonFrom } from '../pool'
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
const getJson = jsonFrom('NHL')
const pollJson = jsonFrom('NHL', LIVE_POLL)

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
    let fallback: string | undefined
    const [pbp, box] = await Promise.all([
      pollJson<NhlPlayByPlay>(`${WEB}/gamecenter/${id}/play-by-play`),
      // The box score is a nicety; a failure here must not stop the Plays.
      // Without it the box is only goals from the Plays, so the snapshot
      // says so and LiveGame keeps any full box it already stored.
      pollJson<NhlBoxscore>(`${WEB}/gamecenter/${id}/boxscore`).catch(
        (error: unknown) => {
          fallback = `NHL boxscore unavailable: ${error instanceof Error ? error.message : String(error)}`
          console.warn(`[source] ${fallback}`)
          return null
        },
      ),
    ])
    const game = {
      ...parseGame(pbp, box),
      pollHintSeconds: LIVE_POLL_SECONDS,
    }
    return fallback ? { ...game, fallback, boxPartial: true } : game
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
