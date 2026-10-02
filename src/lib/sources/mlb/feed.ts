/**
 * The slice of MLB StatsAPI's `/api/v1.1/game/{gamePk}/feed/live` and
 * `/api/v1/schedule` responses the adapter reads. Loose on purpose: anything
 * not listed here is ignored, and every field is treated as possibly absent.
 */

interface PersonRef {
  id: number
  fullName?: string
}

export interface MlbPlayEvent {
  index: number
  type?: string
  isPitch?: boolean
  startTime?: string
  endTime?: string
  pitchNumber?: number
  player?: PersonRef
  count?: { balls: number; strikes: number; outs: number }
  details?: {
    event?: string
    eventType?: string
    description?: string
    awayScore?: number
    homeScore?: number
    isInPlay?: boolean
    isStrike?: boolean
    isBall?: boolean
    call?: { code?: string; description?: string }
    type?: { code?: string; description?: string }
  }
  pitchData?: {
    startSpeed?: number
    strikeZoneTop?: number
    strikeZoneBottom?: number
    zone?: number
    coordinates?: { pX?: number; pZ?: number }
  }
  hitData?: {
    launchSpeed?: number
    launchAngle?: number
    totalDistance?: number
    trajectory?: string
  }
}

export interface MlbRunner {
  movement?: {
    start?: string | null
    end?: string | null
    isOut?: boolean
  }
  details?: {
    runner?: PersonRef
    playIndex?: number
  }
  credits?: Array<{ player?: PersonRef; credit?: string }>
}

export interface MlbPlay {
  atBatIndex: number
  result?: {
    eventType?: string
    event?: string
    description?: string
    awayScore?: number
    homeScore?: number
    rbi?: number
    isOut?: boolean
  }
  about?: {
    atBatIndex: number
    halfInning?: 'top' | 'bottom'
    inning?: number
    startTime?: string
    endTime?: string
    isComplete?: boolean
    hasReview?: boolean
  }
  count?: { balls: number; strikes: number; outs: number }
  matchup?: {
    batter?: PersonRef
    pitcher?: PersonRef
    batSide?: { code?: string }
    pitchHand?: { code?: string }
    splits?: { menOnBase?: string }
  }
  runners?: Array<MlbRunner>
  playEvents?: Array<MlbPlayEvent>
  playEndTime?: string
}

export interface MlbTeam {
  id: number
  name: string
  abbreviation?: string
  teamName?: string
}

export interface MlbStatus {
  abstractGameState?: string
  detailedState?: string
  codedGameState?: string
}

export interface MlbFeed {
  gamePk: number
  metaData?: { wait?: number; timeStamp?: string }
  gameData: {
    status: MlbStatus
    datetime: { dateTime: string; officialDate: string }
    teams: { away: MlbTeam; home: MlbTeam }
    players?: Record<string, { id: number; fullName?: string } | undefined>
  }
  liveData: {
    plays: { allPlays: Array<MlbPlay> }
    linescore?: {
      currentInning?: number
      inningHalf?: string
      inningState?: string
      outs?: number
      balls?: number
      strikes?: number
      teams?: {
        away?: { runs?: number }
        home?: { runs?: number }
      }
      offense?: {
        batter?: PersonRef
        first?: PersonRef
        second?: PersonRef
        third?: PersonRef
      }
      defense?: { pitcher?: PersonRef }
    }
  }
}

export interface MlbScheduleGame {
  gamePk: number
  gameDate: string
  officialDate: string
  status: MlbStatus
  teams: {
    away: { team: MlbTeam; score?: number }
    home: { team: MlbTeam; score?: number }
  }
}

export interface MlbSchedule {
  dates?: Array<{ games?: Array<MlbScheduleGame> }>
}
