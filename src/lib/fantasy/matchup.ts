/**
 * The Viewer's Matchup in a Fantasy league, read from ESPN's league views
 * (mTeam, mRoster, mMatchup, mMatchupScore, mSettings). Points leagues:
 * a side's live score is ESPN's live total when it has one, else its
 * Starters' points this scoring period (ESPN's final team total stays 0
 * until the period is over). Pure.
 */

import { SPORTS, slotName } from './sports'
import type { FantasySport } from './sports'

// ─── ESPN's shapes (loose) ─────────────────────────────────────────────────

interface WireStat {
  scoringPeriodId?: number
  statSourceId?: number
  statSplitTypeId?: number
  appliedTotal?: number
  /** Points awarded per stat id. */
  appliedStats?: Record<string, number>
  /** Raw values per stat id. */
  stats?: Record<string, number>
}

interface WireEntry {
  lineupSlotId?: number
  playerId?: number
  playerPoolEntry?: {
    appliedStatTotal?: number
    player?: {
      id?: number
      fullName?: string
      proTeamId?: number
      defaultPositionId?: number
      injuryStatus?: string
      stats?: Array<WireStat>
    }
  }
}

interface WireSide {
  teamId?: number
  totalPoints?: number
  totalPointsLive?: number
  totalProjectedPointsLive?: number
  rosterForCurrentScoringPeriod?: { entries?: Array<WireEntry> }
}

export interface WireLeague {
  id?: number
  scoringPeriodId?: number
  status?: { currentMatchupPeriod?: number; latestScoringPeriod?: number }
  settings?: {
    name?: string
    scoringSettings?: { scoringType?: string }
  }
  teams?: Array<{
    id: number
    abbrev?: string
    name?: string
    location?: string
    nickname?: string
    owners?: Array<string>
    primaryOwner?: string
    logo?: string
    roster?: { entries?: Array<WireEntry> }
    record?: { overall?: { wins?: number; losses?: number; ties?: number } }
  }>
  schedule?: Array<{
    matchupPeriodId?: number
    home?: WireSide
    away?: WireSide
    winner?: string
  }>
}

// ─── What Sportsline keeps ─────────────────────────────────────────────────

export interface LineupPlayer {
  /** ESPN's player id (an ESPN athlete id; negative for D/ST). */
  espnId: number
  /** Our Player, once matched (for links, the feed and Alerts). */
  playerId?: string | null
  name: string
  slot: string
  slotId: number
  /** ESPN's position id (football: 1 QB, 2 RB, 3 WR, 4 TE, 5 K, 16 D/ST). */
  positionId: number | null
  starter: boolean
  /** Fantasy points this scoring period so far (null before any stats). */
  points: number | null
  projected: number | null
  proTeamId: number | null
  injury: string | null
  /** Where this period's points came from: each stat's value and points. */
  breakdown: Array<{ statId: number; value: number; points: number }>
  /** Our Team, its logo and abbreviation (for D/ST, and the Game's state). */
  teamId?: string | null
  teamLogo?: string | null
  teamAbbrev?: string | null
}

export interface MatchupSide {
  teamId: number
  name: string
  abbrev: string
  logo: string | null
  record: string | null
  /** Live Fantasy points (Starters). */
  score: number
  projected: number | null
  lineup: Array<LineupPlayer>
}

export interface MatchupView {
  sport: FantasySport
  leagueName: string
  scoringType: string
  matchupPeriod: number
  scoringPeriod: number
  mine: MatchupSide
  /** Null on a bye week. */
  opponent: MatchupSide | null
}

const round = (n: number) => Math.round(n * 100) / 100

function teamName(t: NonNullable<WireLeague['teams']>[number]): string {
  return (
    t.name ??
    ([t.location, t.nickname].filter(Boolean).join(' ') || `Team ${t.id}`)
  )
}

function lineupOf(
  sport: FantasySport,
  entries: ReadonlyArray<WireEntry>,
  scoringPeriod: number,
): Array<LineupPlayer> {
  const notStarting = SPORTS[sport].notStarting
  return entries.flatMap((e) => {
    const p = e.playerPoolEntry?.player
    const id = p?.id ?? e.playerId
    if (id === undefined) return []
    const line = (source: number) =>
      p?.stats?.find(
        (s) =>
          s.scoringPeriodId === scoringPeriod &&
          s.statSourceId === source &&
          (s.statSplitTypeId === undefined || s.statSplitTypeId === 1),
      )
    const stat = (source: number) => line(source)?.appliedTotal
    const actual = stat(0)
    const actualLine = line(0)
    const slotId = e.lineupSlotId ?? 20
    return [
      {
        espnId: id,
        name: p?.fullName ?? `#${id}`,
        slot: slotName(sport, slotId),
        slotId,
        positionId: p?.defaultPositionId ?? null,
        starter: !notStarting.has(slotId),
        points: actual === undefined ? null : round(actual),
        projected: stat(1) === undefined ? null : round(stat(1)!),
        proTeamId: p?.proTeamId ?? null,
        injury:
          p?.injuryStatus && p.injuryStatus !== 'ACTIVE'
            ? p.injuryStatus
            : null,
        breakdown: Object.entries(actualLine?.appliedStats ?? {})
          .filter(([, points]) => Math.abs(points) > 0.001)
          .map(([statId, points]) => ({
            statId: Number(statId),
            value: actualLine?.stats?.[statId] ?? 0,
            points: round(points),
          }))
          .sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
      },
    ]
  })
}

/**
 * Starters in the sport's slot order (QB, RB, WR…), so two Lineups pair
 * slot by slot; then the bench, then injured reserve.
 */
function sorted(
  sport: FantasySport,
  lineup: Array<LineupPlayer>,
): Array<LineupPlayer> {
  const order = SPORTS[sport].slotOrder
  const rank = (p: LineupPlayer) =>
    p.starter ? order.indexOf(p.slotId) + 1 || order.length + 1 : 100 + p.slotId
  return [...lineup].sort((a, b) => rank(a) - rank(b))
}

function sideOf(
  sport: FantasySport,
  league: WireLeague,
  side: WireSide,
  scoringPeriod: number,
): MatchupSide | null {
  const team = league.teams?.find((t) => t.id === side.teamId)
  if (!team) return null
  const entries =
    side.rosterForCurrentScoringPeriod?.entries ?? team.roster?.entries ?? []
  const lineup = sorted(sport, lineupOf(sport, entries, scoringPeriod))
  const starters = lineup.filter((p) => p.starter)
  const summed = starters.reduce((n, p) => n + (p.points ?? 0), 0)
  const projectedSum = starters.reduce(
    (n, p) => n + Math.max(p.points ?? 0, p.projected ?? 0),
    0,
  )
  const overall = team.record?.overall
  return {
    teamId: team.id,
    name: teamName(team),
    abbrev: team.abbrev ?? teamName(team).slice(0, 4).toUpperCase(),
    logo: team.logo ?? null,
    record: overall
      ? `${overall.wins ?? 0}-${overall.losses ?? 0}${overall.ties ? `-${overall.ties}` : ''}`
      : null,
    // ESPN's live total once it reports one; until then, the Starters'.
    score: round(side.totalPointsLive || summed),
    projected:
      side.totalProjectedPointsLive != null
        ? round(side.totalProjectedPointsLive)
        : starters.some((p) => p.projected !== null)
          ? round(projectedSum)
          : null,
    lineup,
  }
}

/** The Viewer's team in a league: the one their SWID owns, else `teamId`. */
export function myTeamId(
  league: WireLeague,
  swid: string,
  teamId?: number | null,
): number | null {
  const want = `{${swid.replace(/[{}]/g, '').toUpperCase()}}`
  const owned = league.teams?.find(
    (t) =>
      t.owners?.some((o) => o.toUpperCase() === want) ||
      t.primaryOwner?.toUpperCase() === want,
  )
  return owned?.id ?? teamId ?? null
}

export function readMatchup(
  sport: FantasySport,
  league: WireLeague,
  teamId: number,
): MatchupView | null {
  const period = league.status?.currentMatchupPeriod ?? 1
  const scoringPeriod =
    league.scoringPeriodId ?? league.status?.latestScoringPeriod ?? period
  const game = league.schedule?.find(
    (m) =>
      m.matchupPeriodId === period &&
      (m.home?.teamId === teamId || m.away?.teamId === teamId),
  )
  const mineWire =
    game?.home?.teamId === teamId ? game.home : (game?.away ?? { teamId })
  const theirsWire =
    game && game.home?.teamId === teamId ? game.away : game?.home
  const mine = sideOf(sport, league, mineWire, scoringPeriod)
  if (!mine) return null
  return {
    sport,
    leagueName: league.settings?.name ?? `League ${league.id ?? ''}`.trim(),
    scoringType: league.settings?.scoringSettings?.scoringType ?? 'H2H_POINTS',
    matchupPeriod: period,
    scoringPeriod,
    mine,
    opponent: theirsWire
      ? sideOf(sport, league, theirsWire, scoringPeriod)
      : null,
  }
}
