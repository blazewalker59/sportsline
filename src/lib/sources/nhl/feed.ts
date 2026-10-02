/**
 * The slice of NHL.com's `api-web.nhle.com` responses the adapter reads:
 * gamecenter play-by-play and boxscore, the daily schedule, rosters, and the
 * stats API team list. Loose on purpose; every field may be absent.
 */

interface Localized {
  default?: string
}

export interface NhlPeriod {
  number: number
  periodType?: 'REG' | 'OT' | 'SO'
}

export interface NhlTeam {
  id: number
  abbrev: string
  score?: number
  commonName?: Localized
  placeName?: Localized
}

export interface NhlPlay {
  eventId: number
  sortOrder?: number
  typeDescKey: string
  periodDescriptor?: NhlPeriod
  timeInPeriod?: string
  timeRemaining?: string
  situationCode?: string
  details?: {
    eventOwnerTeamId?: number
    shotType?: string
    reason?: string
    descKey?: string
    duration?: number
    typeCode?: string
    awayScore?: number
    homeScore?: number
    awaySOG?: number
    homeSOG?: number
    xCoord?: number
    yCoord?: number
    zoneCode?: string
    scoringPlayerId?: number
    scoringPlayerTotal?: number
    assist1PlayerId?: number
    assist1PlayerTotal?: number
    assist2PlayerId?: number
    assist2PlayerTotal?: number
    goalieInNetId?: number
    shootingPlayerId?: number
    blockingPlayerId?: number
    hittingPlayerId?: number
    hitteePlayerId?: number
    playerId?: number
    winningPlayerId?: number
    losingPlayerId?: number
    committedByPlayerId?: number
    drawnByPlayerId?: number
    servedByPlayerId?: number
  }
}

export interface NhlPlayByPlay {
  id: number
  gameState?: string
  gameScheduleState?: string
  gameDate?: string
  startTimeUTC: string
  periodDescriptor?: NhlPeriod
  clock?: { timeRemaining?: string; inIntermission?: boolean }
  awayTeam: NhlTeam
  homeTeam: NhlTeam
  rosterSpots?: Array<{
    playerId: number
    teamId?: number
    firstName?: Localized
    lastName?: Localized
    positionCode?: string
  }>
  plays?: Array<NhlPlay>
}

interface NhlSkaterLine {
  playerId: number
  name?: Localized
  position?: string
  goals?: number
  assists?: number
  points?: number
  plusMinus?: number
  pim?: number
  hits?: number
  sog?: number
  toi?: string
}

interface NhlGoalieLine {
  playerId: number
  name?: Localized
  saveShotsAgainst?: string
  goalsAgainst?: number
  savePctg?: number
  toi?: string
  starter?: boolean
}

interface NhlTeamStats {
  forwards?: Array<NhlSkaterLine>
  defense?: Array<NhlSkaterLine>
  goalies?: Array<NhlGoalieLine>
}

export interface NhlBoxscore {
  awayTeam?: NhlTeam & { sog?: number }
  homeTeam?: NhlTeam & { sog?: number }
  playerByGameStats?: { awayTeam?: NhlTeamStats; homeTeam?: NhlTeamStats }
}

export interface NhlSchedule {
  gameWeek?: Array<{
    date: string
    games?: Array<{
      id: number
      gameState?: string
      gameScheduleState?: string
      startTimeUTC: string
      awayTeam: NhlTeam
      homeTeam: NhlTeam
    }>
  }>
}

export interface NhlStatsTeams {
  data?: Array<{ id: number; fullName?: string; triCode?: string }>
}

export interface NhlStandings {
  standings?: Array<{ teamAbbrev?: Localized }>
}

export interface NhlRoster {
  forwards?: Array<NhlRosterPlayer>
  defensemen?: Array<NhlRosterPlayer>
  goalies?: Array<NhlRosterPlayer>
}

interface NhlRosterPlayer {
  id: number
  firstName?: Localized
  lastName?: Localized
  positionCode?: string
}
