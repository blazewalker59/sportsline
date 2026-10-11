/**
 * The slice of ESPN's NBA summary (`/apis/site/v2/sports/basketball/nba/
 * summary?event=`) the adapter reads: header status and linescores, the
 * play-by-play, and box score. Loose on purpose.
 */

import type { EspnCompetitor, EspnStatus } from '../nfl/feed'

interface NbaPlay {
  id: string
  sequenceNumber?: string
  type?: { id?: string; text?: string }
  text?: string
  awayScore?: number
  homeScore?: number
  period?: { number?: number }
  clock?: { displayValue?: string }
  scoringPlay?: boolean
  scoreValue?: number
  shootingPlay?: boolean
  team?: { id?: string }
  participants?: Array<{ athlete?: { id?: string } }>
  wallclock?: string
  coordinate?: { x?: number; y?: number }
}

interface NbaBoxAthlete {
  athlete: {
    id: string
    displayName?: string
    position?: { abbreviation?: string }
  }
  starter?: boolean
  didNotPlay?: boolean
  stats?: Array<string>
}

export interface NbaSummary {
  header: {
    id: string
    competitions: Array<{
      date: string
      status: EspnStatus
      competitors: Array<EspnCompetitor>
    }>
  }
  plays?: Array<NbaPlay>
  boxscore?: {
    players?: Array<{
      team: { id: string; abbreviation?: string }
      statistics?: Array<{
        names?: Array<string>
        athletes?: Array<NbaBoxAthlete>
      }>
    }>
  }
}

export interface NbaRoster {
  athletes?: Array<{
    id: string
    fullName?: string
    displayName?: string
    position?: { abbreviation?: string }
    headshot?: { href?: string }
  }>
}
