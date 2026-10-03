/**
 * The slice of ESPN's NFL responses the adapter reads: the site API summary
 * (`/apis/site/v2/sports/football/nfl/summary?event=`) for status, drives
 * and box score, and the core API plays list for each Play's participants.
 * Loose on purpose; every field is treated as possibly absent.
 */

interface Ref {
  $ref?: string
}

export interface EspnStatus {
  period?: number
  displayClock?: string
  type?: { name?: string; state?: 'pre' | 'in' | 'post'; detail?: string }
}

export interface EspnCompetitor {
  id: string
  homeAway: 'home' | 'away'
  score?: string
  team: {
    id: string
    abbreviation?: string
    displayName?: string
    name?: string
    /** College football only: the team's conference. */
    conferenceId?: string
  }
  linescores?: Array<{ displayValue?: string }>
}

export interface EspnDrivePlay {
  id: string
  wallclock?: string
}

export interface EspnDrive {
  id: string
  description?: string
  displayResult?: string
  team?: { id?: string; abbreviation?: string }
  plays?: Array<EspnDrivePlay>
}

export interface EspnBoxStatistics {
  name: string
  labels?: Array<string>
  athletes?: Array<{
    athlete: { id: string; displayName?: string }
    stats?: Array<string>
  }>
}

export interface NflSummary {
  header: {
    id: string
    competitions: Array<{
      date: string
      status: EspnStatus
      competitors: Array<EspnCompetitor>
    }>
  }
  drives?: { previous?: Array<EspnDrive>; current?: EspnDrive }
  boxscore?: {
    players?: Array<{
      team: { id: string; abbreviation?: string }
      statistics?: Array<EspnBoxStatistics>
    }>
  }
}

export interface NflDownDistance {
  down?: number
  distance?: number
  downDistanceText?: string
  team?: Ref & { id?: string }
}

export interface NflCorePlay {
  id: string
  sequenceNumber?: string
  type?: { id?: string; text?: string }
  text?: string
  awayScore?: number
  homeScore?: number
  period?: { number?: number }
  clock?: { displayValue?: string }
  scoringPlay?: boolean
  isTurnover?: boolean
  isPenalty?: boolean
  statYardage?: number
  modified?: string
  team?: Ref
  start?: NflDownDistance
  end?: NflDownDistance
  participants?: Array<{ athlete?: Ref; type?: string; order?: number }>
}

export interface NflCorePlays {
  items?: Array<NflCorePlay>
}

export interface NflScoreboard {
  events?: Array<{
    id: string
    date: string
    status?: EspnStatus
    competitions?: Array<{ competitors?: Array<EspnCompetitor> }>
  }>
}

export interface NflTeams {
  sports?: Array<{
    leagues?: Array<{
      teams?: Array<{
        team: { id: string; abbreviation?: string; displayName?: string }
      }>
    }>
  }>
}

export interface NflRoster {
  athletes?: Array<{
    items?: Array<{
      id: string
      fullName?: string
      displayName?: string
      position?: { abbreviation?: string }
    }>
  }>
}
