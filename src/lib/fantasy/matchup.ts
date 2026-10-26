/**
 * The Viewer's Matchup in a Fantasy league, read from ESPN's league views
 * (mTeam, mRoster, mMatchup, mMatchupScore, mSettings). Points leagues:
 * a side's live score is ESPN's live total when it has one, else its
 * Starters' points this scoring period (ESPN's final team total stays 0
 * until the period is over). Category leagues (categories.ts): a side's
 * score is the categories it leads. Pure.
 */

import {
  addStats,
  isCategoryScoring,
  isRate,
  leagueCategories,
  playerDayLine,
  scoreCategories,
  tally,
  toStats,
} from './categories'
import { SPORTS, slotName } from './sports'
import type { CategoryResult, LeagueCategory, Stats } from './categories'
import type { WhatIfMatchupInput, WhatIfPlayer } from './whatIf'
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
  stats?: Record<string, number | string>
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
      /** Share of ESPN's leagues that roster the Player. */
      ownership?: { percentOwned?: number }
      /** The lineup slots the Player can fill. */
      eligibleSlots?: Array<number>
    }
  }
}

interface WireSide {
  teamId?: number
  totalPoints?: number
  totalPointsLive?: number
  totalProjectedPointsLive?: number
  /** Category leagues: each stat's total through the last scoring period. */
  cumulativeScore?: {
    wins?: number
    losses?: number
    ties?: number
    scoreByStat?: Record<string, { score?: number | string }>
  }
  rosterForCurrentScoringPeriod?: { entries?: Array<WireEntry> }
  /**
   * Everyone who counted for the side this matchup period (dropped Players
   * too), each with their matchup line (scoringPeriodId 0).
   */
  rosterForMatchupPeriod?: { entries?: Array<WireEntry> }
}

export interface WireLeague {
  id?: number
  scoringPeriodId?: number
  status?: { currentMatchupPeriod?: number; latestScoringPeriod?: number }
  settings?: {
    name?: string
    /** Each matchup period's scoring periods (days), by period id. */
    scheduleSettings?: {
      matchupPeriods?: Record<string, Array<number>>
      playoffTeamCount?: number
    }
    /** How many of each lineup slot the league starts, by slot id. */
    rosterSettings?: { lineupSlotCounts?: Record<string, number> }
    scoringSettings?: {
      scoringType?: string
      scoringItems?: Array<{ statId?: number; isReverseItem?: boolean }>
      /** Category leagues' innings minimum: { statId: 34, limitValue: outs }. */
      statQualificationMinimum?: { statId?: number; limitValue?: number }
    }
    /** Waivers: whether claims bid from a season's budget (FAAB). */
    acquisitionSettings?: {
      isUsingAcquisitionBudget?: boolean
      acquisitionBudget?: number
      minimumBid?: number
    }
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
    /** The season's moves so far: in a budget league, what's been bid. */
    transactionCounter?: { acquisitionBudgetSpent?: number }
    record?: {
      overall?: {
        wins?: number
        losses?: number
        ties?: number
        pointsFor?: number
        pointsAgainst?: number
        streakLength?: number
        streakType?: string
      }
    }
    /** The current standings' place. */
    playoffSeed?: number
    /** The final place. */
    rankCalculatedFinal?: number
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
  /**
   * ESPN's player id (an ESPN athlete id; negative for D/ST). For another
   * provider, a stand-in unique within the league (see sleeper/read.ts).
   */
  espnId: number
  /** The provider's own player id, when that isn't ESPN. */
  sourcePlayerId?: string
  /** A headshot found for the Player (when ESPN's id can't give one). */
  headshot?: string | null
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
  /** ESPN: the share of its leagues that roster the Player (0–100). */
  owned?: number
  /** Where this period's points came from: each stat's value and points. */
  breakdown: Array<{
    statId: number
    /** The stat's name, when it isn't one of ESPN's stat ids. */
    label?: string
    value: number
    points: number
  }>
  /** Category leagues: their line today in the league's categories. */
  dayLine?: Array<{ label: string; value: string }> | null
  /** Category leagues: their raw stats that day, by ESPN stat id. */
  dayStats?: Stats | null
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
  /**
   * Category leagues: the whole matchup so far, a row per Player who's on
   * the roster or counted this matchup, `dayStats` holding their matchup
   * line. `starter` marks who counted.
   */
  summary?: Array<LineupPlayer> | null
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
  /**
   * Category leagues: each category's values and leader. Each side's
   * `score` is then the categories it leads; ties are counted here.
   */
  categories?: Array<CategoryResult> | null
  ties?: number
  /** Category leagues: each category from today's Starters alone. */
  today?: Array<CategoryResult> | null
  /** The matchup's scoring periods (days), first to last. */
  days?: Array<number>
  /**
   * The league's other Matchups this period, as scores: the Viewer's own
   * Matchup only (each opens in full on demand, readLeagueMatchup).
   */
  others?: Array<LeagueMatchup>
  /**
   * When it was read from its provider, once stored: a failed sync keeps
   * the last one, so its age is how old the scores are.
   */
  asOf?: string
}

/** One side of another Matchup in the league, as its scoreboard shows it. */
export interface LeagueMatchupSide {
  teamId: number
  name: string
  abbrev: string
  logo: string | null
  record: string | null
  /** Fantasy points, or in a category league the categories it leads. */
  score: number
}

/** Another Matchup in the Viewer's league: two teams, or one on a bye. */
export interface LeagueMatchup {
  left: LeagueMatchupSide
  right: LeagueMatchupSide | null
  /** Category leagues: categories neither side leads. */
  ties?: number
}

/** A Matchup read as if `left` were the Viewer's, down to its scores. */
export function asLeagueMatchup(view: MatchupView): LeagueMatchup {
  const side = (s: MatchupSide): LeagueMatchupSide => ({
    teamId: s.teamId,
    name: s.name,
    abbrev: s.abbrev,
    logo: s.logo,
    record: s.record,
    score: s.score,
  })
  return {
    left: side(view.mine),
    right: view.opponent ? side(view.opponent) : null,
    ...(view.ties ? { ties: view.ties } : {}),
  }
}

/**
 * One day of a category Matchup: each side's Lineup that day with their
 * lines, and each category from that day's Starters alone.
 */
export interface MatchupDay {
  scoringPeriod: number
  categories: Array<CategoryResult>
  mine: Array<LineupPlayer>
  opponent: Array<LineupPlayer> | null
}

const round = (n: number) => Math.round(n * 100) / 100

export function teamName(t: NonNullable<WireLeague['teams']>[number]): string {
  return (
    t.name ??
    ([t.location, t.nickname].filter(Boolean).join(' ') || `Team ${t.id}`)
  )
}

/** This scoring period's stat lines (split 1 or 5; ESPN uses both). */
const periodLine = (
  s: WireStat,
  scoringPeriod: number,
  source: number,
): boolean =>
  s.scoringPeriodId === scoringPeriod &&
  s.statSourceId === source &&
  (s.statSplitTypeId === undefined ||
    s.statSplitTypeId === 1 ||
    s.statSplitTypeId === 5)

/** A Player's raw stats today, summed (a doubleheader has two lines). */
function dayStats(e: WireEntry, scoringPeriod: number): Stats {
  return addStats(
    ...(e.playerPoolEntry?.player?.stats ?? [])
      .filter((s) => periodLine(s, scoringPeriod, 0))
      .map((s) => toStats(s.stats)),
  )
}

function lineupOf(
  sport: FantasySport,
  entries: ReadonlyArray<WireEntry>,
  scoringPeriod: number,
  categories: ReadonlyArray<LeagueCategory> | null,
): Array<LineupPlayer> {
  const notStarting = SPORTS[sport].notStarting
  return entries.flatMap((e) => {
    const p = e.playerPoolEntry?.player
    const id = p?.id ?? e.playerId
    if (id === undefined) return []
    const line = (source: number) =>
      p?.stats?.find((s) => periodLine(s, scoringPeriod, source))
    const stat = (source: number) => line(source)?.appliedTotal
    const actual = stat(0)
    const actualLine = line(0)
    const day = dayStats(e, scoringPeriod)
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
        ...(p?.ownership?.percentOwned === undefined
          ? {}
          : { owned: round(p.ownership.percentOwned) }),
        breakdown: Object.entries(actualLine?.appliedStats ?? {})
          .filter(([, points]) => Math.abs(points) > 0.001)
          .map(([statId, points]) => ({
            statId: Number(statId),
            value: Number(actualLine?.stats?.[statId] ?? 0),
            points: round(points),
          }))
          .sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
        dayLine: categories ? playerDayLine(sport, categories, day) : null,
        dayStats: categories ? day : null,
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

/** A side's Starters' stats in one scoring period, summed. */
function startersDay(
  sport: FantasySport,
  side: WireSide,
  scoringPeriod: number,
): Stats {
  const notStarting = SPORTS[sport].notStarting
  return addStats(
    ...(side.rosterForCurrentScoringPeriod?.entries ?? [])
      .filter((e) => !notStarting.has(e.lineupSlotId ?? -1))
      .map((e) => dayStats(e, scoringPeriod)),
  )
}

/**
 * A side's category totals: through yesterday from ESPN, plus today's
 * Starters (ratios are recomputed from the sum, in categories.ts).
 */
function categoryTotals(
  sport: FantasySport,
  side: WireSide,
  scoringPeriod: number,
): { totals: Stats; given: Stats } {
  const given = toStats(side.cumulativeScore?.scoreByStat)
  return {
    totals: addStats(given, startersDay(sport, side, scoringPeriod)),
    given,
  }
}

/** Each category from one day's Starters alone (no innings minimum). */
function dayCategories(
  sport: FantasySport,
  categories: ReadonlyArray<LeagueCategory>,
  mine: WireSide,
  theirs: WireSide | undefined,
  scoringPeriod: number,
): Array<CategoryResult> {
  const day = (side: WireSide) => ({
    totals: startersDay(sport, side, scoringPeriod),
    given: {},
  })
  return scoreCategories(
    sport,
    categories,
    day(mine),
    theirs ? day(theirs) : null,
    null,
  )
}

function sideOf(
  sport: FantasySport,
  league: WireLeague,
  side: WireSide,
  scoringPeriod: number,
  categories: ReadonlyArray<LeagueCategory> | null = null,
): MatchupSide | null {
  const team = league.teams?.find((t) => t.id === side.teamId)
  if (!team) return null
  const entries =
    side.rosterForCurrentScoringPeriod?.entries ?? team.roster?.entries ?? []
  const lineup = sorted(
    sport,
    lineupOf(sport, entries, scoringPeriod, categories),
  )
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
    ...(categories
      ? { summary: summaryOf(sport, side, lineup, categories) }
      : {}),
  }
}

/**
 * A side's whole matchup by Player: ESPN's matchup line for each who
 * counted. Whether that line takes in today varies, so it's checked
 * against the side's totals through yesterday: when the lines add up to
 * those, today's Starters' lines go on top.
 */
function summaryOf(
  sport: FantasySport,
  side: WireSide,
  lineup: ReadonlyArray<LineupPlayer>,
  categories: ReadonlyArray<LeagueCategory>,
): Array<LineupPlayer> {
  const counted = lineupOf(
    sport,
    side.rosterForMatchupPeriod?.entries ?? [],
    0,
    categories,
  )
  const period = new Map(counted.map((p) => [p.espnId, p.dayStats ?? {}]))
  const given = toStats(side.cumulativeScore?.scoreByStat)
  const summed = addStats(...period.values())
  // Counts only: a rate (FG%) doesn't add up across Players.
  const ids = Object.keys(given).filter(
    (k) => k in summed && !isRate(sport, Number(k)),
  )
  const throughYesterday =
    ids.length > 0 && ids.every((k) => Math.abs(summed[k] - given[k]) < 0.01)
  const line = (p: LineupPlayer): Stats => {
    const before = period.get(p.espnId) ?? {}
    return throughYesterday && p.starter
      ? addStats(before, p.dayStats ?? {})
      : before
  }
  const onRoster = lineup.map((p) => {
    const stats = line(p)
    return {
      ...p,
      starter: Object.values(stats).some((n) => n > 0),
      dayStats: stats,
      dayLine: playerDayLine(sport, categories, stats),
    }
  })
  // Dropped this matchup but counted before they went.
  const gone = counted
    .filter((p) => !lineup.some((q) => q.espnId === p.espnId))
    .map((p) => ({ ...p, starter: true }))
  const rank = (p: LineupPlayer) => (p.starter ? 0 : 1)
  return [...onRoster, ...gone].sort((a, b) => rank(a) - rank(b))
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

/** The Viewer's side and their opponent's in one matchup period. */
function sidesOf(
  league: WireLeague,
  period: number,
  teamId: number,
): { mineWire: WireSide; theirsWire: WireSide | undefined } {
  const game = league.schedule?.find(
    (m) =>
      m.matchupPeriodId === period &&
      (m.home?.teamId === teamId || m.away?.teamId === teamId),
  )
  return {
    mineWire:
      game?.home?.teamId === teamId ? game.home : (game?.away ?? { teamId }),
    theirsWire: game && game.home?.teamId === teamId ? game.away : game?.home,
  }
}

function categoriesOf(
  sport: FantasySport,
  league: WireLeague,
): Array<LeagueCategory> | null {
  const scoring = league.settings?.scoringSettings
  return isCategoryScoring(scoring?.scoringType)
    ? leagueCategories(sport, scoring?.scoringItems ?? [])
    : null
}

/** The matchup period a scoring period falls in, from the league's schedule. */
function periodOf(league: WireLeague, scoringPeriod: number): number | null {
  const periods = league.settings?.scheduleSettings?.matchupPeriods ?? {}
  const hit = Object.entries(periods).find(([, days]) =>
    days.includes(scoringPeriod),
  )
  return hit ? Number(hit[0]) : null
}

export function readMatchup(
  sport: FantasySport,
  league: WireLeague,
  teamId: number,
): MatchupView | null {
  const period = league.status?.currentMatchupPeriod ?? 1
  const scoringPeriod =
    league.scoringPeriodId ?? league.status?.latestScoringPeriod ?? period
  const { mineWire, theirsWire } = sidesOf(league, period, teamId)
  const scoring = league.settings?.scoringSettings
  const scoringType = scoring?.scoringType ?? 'H2H_POINTS'
  const categories = categoriesOf(sport, league)
  const mine = sideOf(sport, league, mineWire, scoringPeriod, categories)
  if (!mine) return null
  const opponent = theirsWire
    ? sideOf(sport, league, theirsWire, scoringPeriod, categories)
    : null
  const view: MatchupView = {
    sport,
    leagueName: league.settings?.name ?? `League ${league.id ?? ''}`.trim(),
    scoringType,
    matchupPeriod: period,
    scoringPeriod,
    mine,
    opponent,
  }
  if (categories) {
    const minimum = scoring?.statQualificationMinimum
    const results = scoreCategories(
      sport,
      categories,
      categoryTotals(sport, mineWire, scoringPeriod),
      theirsWire && opponent
        ? categoryTotals(sport, theirsWire, scoringPeriod)
        : null,
      minimum?.statId === 34 && minimum.limitValue ? minimum.limitValue : null,
    )
    const t = tally(results)
    view.categories = results
    view.ties = t.ties
    view.today = dayCategories(
      sport,
      categories,
      mineWire,
      theirsWire && opponent ? theirsWire : undefined,
      scoringPeriod,
    )
    const days =
      league.settings?.scheduleSettings?.matchupPeriods?.[String(period)]
    view.days = days?.length ? [...days].sort((a, b) => a - b) : [scoringPeriod]
    // A side's score is the categories it leads; points mean nothing here.
    mine.score = t.wins
    mine.projected = null
    if (opponent) {
      opponent.score = t.losses
      opponent.projected = null
    }
  }
  return view
}

/**
 * Every team in the league as a Matchup side this period: its whole
 * Lineup, read the way the Viewer's is (for leaders and rosters).
 */
export function readTeamSides(
  sport: FantasySport,
  league: WireLeague,
): Array<MatchupSide> {
  return readTeamViews(sport, league).map((v) => v.mine)
}

/**
 * Every team's Matchup this period read as if it were the Viewer's: in a
 * category league, `categories` and `today` hold that team's totals
 * (`mineValue`), for the leaders' team ranks.
 */
export function readTeamViews(
  sport: FantasySport,
  league: WireLeague,
): Array<MatchupView> {
  return (league.teams ?? []).flatMap((t) => {
    const view = readMatchup(sport, league, t.id)
    return view ? [view] : []
  })
}

/**
 * Every other Matchup in the league this period, each read the way the
 * Viewer's is (its away team on the left), in ESPN's schedule order.
 */
export function readLeagueMatchups(
  sport: FantasySport,
  league: WireLeague,
  mine: number,
): Array<LeagueMatchup> {
  const period = league.status?.currentMatchupPeriod ?? 1
  return (league.schedule ?? []).flatMap((game) => {
    if (game.matchupPeriodId !== period) return []
    const ids = [game.away?.teamId, game.home?.teamId]
    if (ids.includes(mine)) return []
    const left = ids.find((id) => id !== undefined)
    const view = left === undefined ? null : readMatchup(sport, league, left)
    return view ? [asLeagueMatchup(view)] : []
  })
}

/**
 * One day of a category Matchup, from league views read for that scoring
 * period (ESPN's `scoringPeriodId`): each side's Lineup that day and each
 * category from that day's Starters. Null outside a category league, or
 * when the Viewer's team isn't in it.
 */
export function readMatchupDay(
  sport: FantasySport,
  league: WireLeague,
  teamId: number,
  scoringPeriod: number,
): MatchupDay | null {
  const categories = categoriesOf(sport, league)
  if (!categories) return null
  const period =
    periodOf(league, scoringPeriod) ?? league.status?.currentMatchupPeriod ?? 1
  const { mineWire, theirsWire } = sidesOf(league, period, teamId)
  const mine = sideOf(sport, league, mineWire, scoringPeriod, categories)
  if (!mine) return null
  const opponent = theirsWire
    ? sideOf(sport, league, theirsWire, scoringPeriod, categories)
    : null
  return {
    scoringPeriod,
    categories: dayCategories(
      sport,
      categories,
      mineWire,
      opponent ? theirsWire : undefined,
      scoringPeriod,
    ),
    mine: mine.lineup,
    opponent: opponent?.lineup ?? null,
  }
}

/** ESPN's injured reserve slot: never a Player who could have started. */
const IR_SLOT = 21

/**
 * One finished week of a points league, from league views read for that
 * scoring period, as What-if input (whatIf.ts): the league's starting
 * slots and each decided matchup's sides. Null when the week is one of a
 * matchup's several (a two-week playoff round) or none are decided.
 */
export function readWhatIfWeek(
  sport: FantasySport,
  league: WireLeague,
  scoringPeriod: number,
): { slots: Array<string>; matchups: Array<WhatIfMatchupInput> } | null {
  const period = periodOf(league, scoringPeriod) ?? scoringPeriod
  const days =
    league.settings?.scheduleSettings?.matchupPeriods?.[String(period)]
  if (days && days.length > 1) return null
  const notStarting = SPORTS[sport].notStarting
  const slots = Object.entries(
    league.settings?.rosterSettings?.lineupSlotCounts ?? {},
  ).flatMap(([id, count]) =>
    notStarting.has(Number(id)) ? [] : Array<string>(count).fill(id),
  )
  if (slots.length === 0) return null
  const side = (w: WireSide | undefined) => {
    const team = league.teams?.find((t) => t.id === w?.teamId)
    if (!w || !team) return null
    const roster = (w.rosterForCurrentScoringPeriod?.entries ?? []).flatMap(
      (e): Array<WhatIfPlayer> => {
        const p = e.playerPoolEntry?.player
        const id = p?.id ?? e.playerId
        const slot = e.lineupSlotId ?? 20
        if (id === undefined || slot === IR_SLOT) return []
        const line = p?.stats?.find((s) => periodLine(s, scoringPeriod, 0))
        return [
          {
            id: String(id),
            name: p?.fullName ?? `#${id}`,
            points: round(
              line?.appliedTotal ?? e.playerPoolEntry?.appliedStatTotal ?? 0,
            ),
            slot: String(slot),
            starter: !notStarting.has(slot),
            eligible: (p?.eligibleSlots ?? [])
              .filter((s) => !notStarting.has(s))
              .map(String),
          },
        ]
      },
    )
    return {
      teamId: team.id,
      name: teamName(team),
      abbrev: team.abbrev ?? teamName(team).slice(0, 4).toUpperCase(),
      total: round(w.totalPoints ?? 0),
      roster,
    }
  }
  const matchups = (league.schedule ?? []).flatMap(
    (g): Array<WhatIfMatchupInput> => {
      if (g.matchupPeriodId !== period) return []
      if (!g.winner || g.winner === 'UNDECIDED') return []
      const home = side(g.home)
      const away = side(g.away)
      return home && away ? [{ period, home, away }] : []
    },
  )
  return matchups.length > 0 ? { slots, matchups } : null
}
