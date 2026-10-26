/**
 * A Sleeper Matchup in Sportsline's shape (fantasy/matchup.ts), so Sleeper
 * leagues use the same cards, sheet, feed and Alerts as ESPN's. Points are
 * Sleeper's own (its league scoring); the breakdown is each scored stat
 * times the league's setting; the projection Sleeper's for the league's
 * reception scoring. Pure.
 */

import { NFL_PRO_TEAMS } from '../sports'
import { asLeagueMatchup } from '../matchup'
import { byBid, kindOf, newestFirst } from '../activity'
import { ranked } from '../standings'
import { AVAILABLE_LIMIT } from '../freeAgents'
import type {
  AvailablePlayer,
  AvailablePlayers,
  SpanStats,
} from '../freeAgents'
import type {
  ActivityEntry,
  ActivityItem,
  ActivityPlayer,
  LeagueActivity,
  WaiverClaim,
} from '../activity'
import type { Standings } from '../standings'
import type {
  WhatIfMatchupInput,
  WhatIfPlayer,
  WhatIfSideInput,
} from '../whatIf'
import type {
  LeagueMatchup,
  LineupPlayer,
  MatchupSide,
  MatchupView,
} from '../matchup'
import type {
  SleeperLeague,
  SleeperMatchup,
  SleeperPlayerInfo,
  SleeperRoster,
  SleeperTransaction,
  SleeperUser,
  SleeperWeekEntry,
} from './client'

/** Sleeper's slots as ESPN's slot ids, so Lineups sort and pair alike. */
const SLOTS: Record<string, { id: number; name: string }> = {
  QB: { id: 0, name: 'QB' },
  RB: { id: 2, name: 'RB' },
  WRRB_FLEX: { id: 3, name: 'RB/WR' },
  WR: { id: 4, name: 'WR' },
  REC_FLEX: { id: 5, name: 'WR/TE' },
  TE: { id: 6, name: 'TE' },
  SUPER_FLEX: { id: 7, name: 'OP' },
  DEF: { id: 16, name: 'D/ST' },
  K: { id: 17, name: 'K' },
  FLEX: { id: 23, name: 'FLEX' },
}
const BENCH = { id: 20, name: 'Bench' }
const RESERVE = { id: 21, name: 'IR' }
const NOT_STARTING = new Set(['BN', 'IR', 'TAXI'])

/** ESPN's position ids (what the sheet colors by). */
const POSITION_IDS: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 4,
  K: 5,
  DEF: 16,
}

/** Sleeper's team abbreviations where they differ from ESPN's. */
const TEAM_ALIASES: Record<string, string> = { WAS: 'WSH', JAC: 'JAX' }
const PRO_TEAM_IDS = new Map(
  Object.entries(NFL_PRO_TEAMS).map(([id, abbr]) => [abbr, Number(id)]),
)
export function proTeamId(team: string | null | undefined): number | null {
  if (!team) return null
  return PRO_TEAM_IDS.get(TEAM_ALIASES[team] ?? team) ?? null
}

const INJURY: Record<string, string> = {
  Questionable: 'QUESTIONABLE',
  Doubtful: 'DOUBTFUL',
  Out: 'OUT',
  IR: 'INJURY_RESERVE',
  PUP: 'INJURY_RESERVE',
  Sus: 'SUSPENSION',
  NA: 'OUT',
  DNR: 'OUT',
  COV: 'OUT',
}

/** Sleeper's stat keys, named as the breakdown shows them. */
const STAT_NAMES: Record<string, string> = {
  pass_yd: 'Pass yds',
  pass_td: 'Pass TD',
  pass_int: 'Interceptions thrown',
  pass_2pt: 'Pass 2-pt',
  pass_cmp: 'Completions',
  pass_inc: 'Incompletions',
  pass_sack: 'Sacked',
  rush_yd: 'Rush yds',
  rush_td: 'Rush TD',
  rush_2pt: 'Rush 2-pt',
  rush_att: 'Rush att',
  rec: 'Receptions',
  rec_yd: 'Rec yds',
  rec_td: 'Rec TD',
  rec_2pt: 'Rec 2-pt',
  rec_tgt: 'Targets',
  bonus_rec_te: 'TE reception bonus',
  fum: 'Fumbles',
  fum_lost: 'Fumbles lost',
  fum_rec_td: 'Fumble return TD',
  kr_td: 'Kick return TD',
  pr_td: 'Punt return TD',
  st_td: 'Special teams TD',
  xpm: 'PAT made',
  xpmiss: 'PAT missed',
  fgm_0_19: 'FG 0-19',
  fgm_20_29: 'FG 20-29',
  fgm_30_39: 'FG 30-39',
  fgm_40_49: 'FG 40-49',
  fgm_50p: 'FG 50+',
  fgm_50_59: 'FG 50-59',
  fgm_60p: 'FG 60+',
  fgmiss: 'FG missed',
  fgmiss_0_19: 'FG missed 0-19',
  fgmiss_20_29: 'FG missed 20-29',
  fgmiss_30_39: 'FG missed 30-39',
  fgmiss_40_49: 'FG missed 40-49',
  fgmiss_50p: 'FG missed 50+',
  def_td: 'Defensive TD',
  int: 'Interceptions',
  fum_rec: 'Fumbles recovered',
  sack: 'Sacks',
  safe: 'Safeties',
  blk_kick: 'Blocked kicks',
  def_st_td: 'Return TD',
  def_st_fum_rec: 'ST fumbles recovered',
  pts_allow_0: 'Points allowed 0',
  pts_allow_1_6: 'Points allowed 1-6',
  pts_allow_7_13: 'Points allowed 7-13',
  pts_allow_14_20: 'Points allowed 14-20',
  pts_allow_21_27: 'Points allowed 21-27',
  pts_allow_28_34: 'Points allowed 28-34',
  pts_allow_35p: 'Points allowed 35+',
  yds_allow_0_100: 'Yards allowed 0-99',
  yds_allow_100_199: 'Yards allowed 100-199',
  yds_allow_200_299: 'Yards allowed 200-299',
  yds_allow_300_349: 'Yards allowed 300-349',
  yds_allow_350_399: 'Yards allowed 350-399',
  yds_allow_400_449: 'Yards allowed 400-449',
  yds_allow_450_499: 'Yards allowed 450-499',
  yds_allow_500_549: 'Yards allowed 500-549',
  yds_allow_550p: 'Yards allowed 550+',
  bonus_pass_yd_300: '300+ pass yds',
  bonus_pass_yd_400: '400+ pass yds',
  bonus_rush_yd_100: '100+ rush yds',
  bonus_rush_yd_200: '200+ rush yds',
  bonus_rec_yd_100: '100+ rec yds',
  bonus_rec_yd_200: '200+ rec yds',
}

function statLabel(key: string): string {
  return (
    STAT_NAMES[key] ??
    key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  )
}

const round = (n: number) => Math.round(n * 100) / 100

export interface WeekData {
  /** Who each player is (name, position, team, injury). */
  info: ReadonlyMap<string, SleeperPlayerInfo>
  /** Raw stats this week, by player id (only those who've played). */
  stats: ReadonlyMap<string, Record<string, number>>
  /** Projected stats this week, including pts_ppr / pts_half_ppr / pts_std. */
  projections: ReadonlyMap<string, Record<string, number>>
}

/** Sleeper's projection for the league's points per reception. */
function projectedPoints(
  proj: Record<string, number> | undefined,
  scoring: Record<string, number>,
): number | null {
  if (!proj) return null
  const rec = scoring.rec ?? 0
  const value =
    rec >= 1 ? proj.pts_ppr : rec >= 0.5 ? proj.pts_half_ppr : proj.pts_std
  return value === undefined ? null : round(value)
}

/**
 * Sleeper's ids aren't ESPN's: a player's `espnId` here is a stand-in
 * unique in the league (its Sleeper id, or minus the NFL team id for a
 * defense), and `sourcePlayerId` keeps the Sleeper id.
 */
function lineupPlayer(
  id: string,
  slot: { id: number; name: string },
  starter: boolean,
  points: number | null,
  league: SleeperLeague,
  week: WeekData,
): LineupPlayer {
  const info = week.info.get(id)
  const defense = info?.position === 'DEF' || /^[A-Z]{2,3}$/.test(id)
  const team = info?.team ?? (defense ? id : null)
  const pro = proTeamId(team)
  const scoring = league.scoring_settings ?? {}
  const stats = week.stats.get(id)
  const name = defense
    ? `${info?.last_name ?? team ?? id} D/ST`
    : [info?.first_name, info?.last_name].filter(Boolean).join(' ') || `#${id}`
  return {
    espnId: defense ? -(pro ?? 0) || -1 : Number(id) || 0,
    sourcePlayerId: id,
    name,
    slot: slot.name,
    slotId: slot.id,
    positionId: POSITION_IDS[info?.position ?? (defense ? 'DEF' : '')] ?? null,
    starter,
    // No line yet means no points yet ("—"), not zero.
    points: stats ? (points ?? 0) : null,
    projected: projectedPoints(week.projections.get(id), scoring),
    proTeamId: pro,
    injury: info?.injury_status
      ? (INJURY[info.injury_status] ?? info.injury_status.toUpperCase())
      : null,
    breakdown: Object.entries(stats ?? {})
      .flatMap(([key, value]) => {
        const per = scoring[key]
        if (!per || !value) return []
        const pts = round(value * per)
        return Math.abs(pts) < 0.005
          ? []
          : [{ statId: 0, label: statLabel(key), value, points: pts }]
      })
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
      .map((b, i) => ({ ...b, statId: i })),
  }
}

const sortKey = (p: LineupPlayer, order: ReadonlyArray<number>) =>
  p.starter ? order.indexOf(p.slotId) + 1 || order.length + 1 : 100 + p.slotId

function sideOf(
  league: SleeperLeague,
  roster: SleeperRoster,
  matchup: SleeperMatchup | undefined,
  users: ReadonlyArray<SleeperUser>,
  week: WeekData,
): MatchupSide {
  const starterSlots = (league.roster_positions ?? []).filter(
    (p) => !NOT_STARTING.has(p),
  )
  const starters = (matchup?.starters ?? roster.starters ?? []).filter(Boolean)
  const all = matchup?.players ?? roster.players ?? []
  const reserve = new Set(roster.reserve ?? [])
  const pointsOf = (id: string) => matchup?.players_points?.[id] ?? null
  const lineup: Array<LineupPlayer> = []
  starters.forEach((id, i) => {
    if (id === '0') return // an empty slot
    const slot = SLOTS[starterSlots[i] ?? ''] ?? BENCH
    lineup.push(lineupPlayer(id, slot, true, pointsOf(id), league, week))
  })
  const started = new Set(starters)
  for (const id of all) {
    if (started.has(id)) continue
    lineup.push(
      lineupPlayer(
        id,
        reserve.has(id) ? RESERVE : BENCH,
        false,
        pointsOf(id),
        league,
        week,
      ),
    )
  }
  const order = [0, 2, 3, 4, 5, 6, 23, 7, 16, 17]
  lineup.sort((a, b) => sortKey(a, order) - sortKey(b, order))
  const s = roster.settings
  const startersNow = lineup.filter((p) => p.starter)
  return {
    ...teamOf(roster, users),
    record: s
      ? `${s.wins ?? 0}-${s.losses ?? 0}${s.ties ? `-${s.ties}` : ''}`
      : null,
    score: round(
      matchup?.custom_points ??
        matchup?.points ??
        startersNow.reduce((n, p) => n + (p.points ?? 0), 0),
    ),
    projected: startersNow.some((p) => p.projected !== null)
      ? round(
          startersNow.reduce(
            (n, p) => n + Math.max(p.points ?? 0, p.projected ?? 0),
            0,
          ),
        )
      : null,
    lineup,
  }
}

/** A roster as a team: its manager's team name (or theirs) and avatar. */
function teamOf(
  roster: SleeperRoster,
  users: ReadonlyArray<SleeperUser>,
): { teamId: number; name: string; abbrev: string; logo: string | null } {
  const owner = users.find((u) => u.user_id === roster.owner_id)
  const name =
    owner?.metadata?.team_name ||
    owner?.display_name ||
    `Team ${roster.roster_id}`
  return {
    teamId: roster.roster_id,
    name,
    abbrev: abbrevOf(name),
    logo: owner?.metadata?.avatar?.startsWith('http')
      ? owner.metadata.avatar
      : owner?.avatar
        ? `https://sleepercdn.com/avatars/thumbs/${owner.avatar}`
        : null,
  }
}

/** "Bronx Bombers" → "BB"; one word → its first four letters. */
function abbrevOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => /\w/.test(w))
  return (
    words.length > 1
      ? words
          .map((w) => w[0])
          .join('')
          .slice(0, 4)
      : name.slice(0, 4)
  ).toUpperCase()
}

/**
 * A Sleeper league's Standings: Sleeper doesn't rank, so they're placed
 * by record, then points for (fantasy/standings.ts).
 */
export function readSleeperStandings(input: {
  league: SleeperLeague
  rosters: ReadonlyArray<SleeperRoster>
  users: ReadonlyArray<SleeperUser>
  mine: number | null
}): Standings | null {
  const { league, rosters: rs, users, mine } = input
  if (rs.length === 0) return null
  const points = (whole?: number, hundredths?: number) =>
    whole === undefined ? null : round(whole + (hundredths ?? 0) / 100)
  return {
    rows: ranked(
      rs.map((r) => {
        const s = r.settings
        // "3W" reads "W3", like ESPN's.
        const streak = /^(\d+)([WLT])$/.exec(r.metadata?.streak ?? '')
        return {
          ...teamOf(r, users),
          wins: s?.wins ?? 0,
          losses: s?.losses ?? 0,
          ties: s?.ties ?? 0,
          pointsFor: points(s?.fpts, s?.fpts_decimal),
          pointsAgainst: points(s?.fpts_against, s?.fpts_against_decimal),
          streak: streak ? `${streak[2]}${streak[1]}` : null,
          mine: r.roster_id === mine,
        }
      }),
    ),
    playoffTeams: league.settings?.playoff_teams ?? null,
  }
}

/**
 * A Sleeper player as a move names them: the same stand-in id a Lineup
 * gives them (lineupPlayer), so they match ours the same way.
 */
function activityPlayer(
  id: string,
  info: ReadonlyMap<string, SleeperPlayerInfo>,
): ActivityPlayer {
  const p = info.get(id)
  const defense = p?.position === 'DEF' || /^[A-Z]{2,3}$/.test(id)
  const team = p?.team ?? (defense ? id : null)
  const pro = proTeamId(team)
  return {
    espnId: defense ? -(pro ?? 0) || -1 : Number(id) || 0,
    sourcePlayerId: id,
    name: defense
      ? `${p?.last_name ?? team ?? id} D/ST`
      : [p?.first_name, p?.last_name].filter(Boolean).join(' ') || `#${id}`,
    positionId: POSITION_IDS[p?.position ?? (defense ? 'DEF' : '')] ?? null,
    proTeamId: pro,
  }
}

/**
 * A Sleeper league's Available players: everyone projected this week
 * whom no roster has, the most projected first under the league's
 * scoring. Sleeper doesn't say who's on waivers.
 */
export function readSleeperAvailable(input: {
  league: SleeperLeague
  rosters: ReadonlyArray<SleeperRoster>
  projections: ReadonlyArray<SleeperWeekEntry>
  /** Each player's season so far. */
  season?: ReadonlyArray<SleeperWeekEntry>
}): AvailablePlayers {
  const rostered = new Set(
    input.rosters.flatMap((r) => [
      ...(r.players ?? []),
      ...(r.reserve ?? []),
      ...(r.taxi ?? []),
    ]),
  )
  const scoring = input.league.scoring_settings ?? {}
  const info = new Map<string, SleeperPlayerInfo>()
  for (const e of input.projections)
    if (e.player)
      info.set(e.player_id, { ...e.player, team: e.team ?? e.player.team })
  const season = new Map(
    (input.season ?? []).map((e) => [e.player_id, e.stats ?? {}]),
  )
  /** Their season's Fantasy points under the league's scoring, and per game. */
  const seasonLine = (id: string): SpanStats | null => {
    const stats = season.get(id)
    const points = projectedPoints(stats, scoring)
    if (!stats || !points) return null
    const games = stats.gp ?? 0
    return {
      stats: null,
      points,
      average: games > 0 ? round(points / games) : null,
    }
  }
  const players = input.projections
    .filter((e) => e.player && !rostered.has(e.player_id))
    .map((e): AvailablePlayer => {
      const status = info.get(e.player_id)?.injury_status
      return {
        ...activityPlayer(e.player_id, info),
        injury: status ? (INJURY[status] ?? status.toUpperCase()) : null,
        owned: null,
        ownedChange: null,
        waivers: false,
        projected: projectedPoints(e.stats, scoring),
        stats: { season: seasonLine(e.player_id), recent: null },
      }
    })
    .sort((a, b) => (b.projected ?? -1) - (a.projected ?? -1))
  return { players: players.slice(0, AVAILABLE_LIMIT), order: 'projected' }
}

/**
 * A Sleeper league's Activity, newest first: each completed move, its
 * adds and drops by roster, a trade between every roster in it.
 * Commissioner moves read as adds and drops too.
 */
export function readSleeperActivity(input: {
  transactions: ReadonlyArray<SleeperTransaction>
  rosters: ReadonlyArray<SleeperRoster>
  users: ReadonlyArray<SleeperUser>
  info: ReadonlyMap<string, SleeperPlayerInfo>
}): LeagueActivity {
  const { transactions: txs, rosters: rs, users, info } = input
  // Every claim in a waiver run on a Player, won or lost.
  const runs = new Map<string, Array<WaiverClaim>>()
  for (const t of txs) {
    if (t.type !== 'waiver') continue
    for (const [id, roster] of Object.entries(t.adds ?? {})) {
      const key = `${t.leg ?? 0}:${id}`
      runs.set(key, [
        ...(runs.get(key) ?? []),
        {
          teamId: roster,
          bid: t.settings?.waiver_bid ?? null,
          won: t.status === 'complete',
        },
      ])
    }
  }
  const entries = txs.flatMap((t): Array<ActivityEntry> => {
    if (t.status !== 'complete') return []
    const adds = Object.entries(t.adds ?? {})
    const drops = Object.entries(t.drops ?? {})
    const trade = t.type === 'trade'
    const items: Array<ActivityItem> = trade
      ? adds.map(([id, to]) => ({
          action: 'add',
          player: activityPlayer(id, info),
          fromTeamId: t.drops?.[id] ?? null,
          toTeamId: to,
        }))
      : [
          ...adds.map(([id, to]) => ({
            action: 'add' as const,
            player: activityPlayer(id, info),
            fromTeamId: null,
            toTeamId: to,
          })),
          ...drops.map(([id, from]) => ({
            action: 'drop' as const,
            player: activityPlayer(id, info),
            fromTeamId: from,
            toTeamId: null,
          })),
        ]
    if (items.length === 0) return []
    const waiver = t.type === 'waiver'
    return [
      {
        id: t.transaction_id,
        kind: trade ? 'trade' : kindOf(items, waiver),
        at: new Date(t.status_updated ?? t.created ?? 0).toISOString(),
        teamIds: trade
          ? [...(t.roster_ids ?? [])].sort((a, b) => a - b)
          : (t.roster_ids ?? []).slice(0, 1),
        items,
        bid: waiver ? (t.settings?.waiver_bid ?? null) : null,
        ...claimsOf(
          waiver ? runs.get(`${t.leg ?? 0}:${adds[0]?.[0]}`) : undefined,
        ),
      },
    ]
  })
  return {
    teams: rs.map((r) => {
      const { teamId, name, abbrev } = teamOf(r, users)
      return { teamId, name, abbrev }
    }),
    entries: newestFirst(entries),
  }
}

function claimsOf(run: ReadonlyArray<WaiverClaim> | undefined): {
  claims?: Array<WaiverClaim>
} {
  return run && run.length > 1 ? { claims: byBid(run) } : {}
}

/** The starting slots each position can fill, Sleeper's flex slots among them. */
const ELIGIBLE: Record<string, ReadonlyArray<string>> = {
  QB: ['QB', 'SUPER_FLEX'],
  RB: ['RB', 'FLEX', 'WRRB_FLEX', 'SUPER_FLEX'],
  WR: ['WR', 'FLEX', 'WRRB_FLEX', 'REC_FLEX', 'SUPER_FLEX'],
  TE: ['TE', 'FLEX', 'REC_FLEX', 'SUPER_FLEX'],
  K: ['K'],
  DEF: ['DEF'],
  DL: ['DL', 'IDP_FLEX'],
  LB: ['LB', 'IDP_FLEX'],
  DB: ['DB', 'IDP_FLEX'],
}

/**
 * One finished week of a Sleeper league as What-if input (whatIf.ts): its
 * starting slots and each matchup's two rosters, every Player they could
 * have started (not the taxi squad) eligible by position.
 */
export function readSleeperWhatIfWeek(input: {
  league: SleeperLeague
  rosters: ReadonlyArray<SleeperRoster>
  users: ReadonlyArray<SleeperUser>
  matchups: ReadonlyArray<SleeperMatchup>
  info: ReadonlyMap<string, SleeperPlayerInfo>
  week: number
}): { slots: Array<string>; matchups: Array<WhatIfMatchupInput> } | null {
  const { league, rosters: rs, users, matchups: ms, info, week } = input
  const slots = (league.roster_positions ?? []).filter(
    (p) => !NOT_STARTING.has(p),
  )
  if (slots.length === 0) return null
  const positionOf = (id: string) =>
    info.get(id)?.position ?? (/^[A-Z]{2,3}$/.test(id) ? 'DEF' : '')
  const side = (m: SleeperMatchup): WhatIfSideInput | null => {
    const roster = rs.find((r) => r.roster_id === m.roster_id)
    if (!roster) return null
    const taxi = new Set(roster.taxi ?? [])
    const starters = m.starters ?? []
    const started = new Set(starters)
    const player = (id: string, slot: string): WhatIfPlayer => {
      const p = info.get(id)
      return {
        id,
        name:
          [p?.first_name, p?.last_name].filter(Boolean).join(' ') || `#${id}`,
        points: round(m.players_points?.[id] ?? 0),
        slot,
        starter: slot !== 'BN',
        eligible: ELIGIBLE[positionOf(id)] ?? [],
      }
    }
    const team = teamOf(roster, users)
    return {
      teamId: team.teamId,
      name: team.name,
      abbrev: team.abbrev,
      total: round(m.custom_points ?? m.points ?? 0),
      roster: [
        ...starters.flatMap((id, i) =>
          id === '0' ? [] : [player(id, slots[i] ?? 'BN')],
        ),
        ...(m.players ?? [])
          .filter((id) => !started.has(id) && !taxi.has(id))
          .map((id) => player(id, 'BN')),
      ],
    }
  }
  const byMatchup = new Map<number, Array<SleeperMatchup>>()
  for (const m of ms)
    if (m.matchup_id != null)
      byMatchup.set(m.matchup_id, [...(byMatchup.get(m.matchup_id) ?? []), m])
  const matchups = [...byMatchup.values()].flatMap(
    (pair): Array<WhatIfMatchupInput> => {
      if (pair.length !== 2) return []
      const home = side(pair[0])
      const away = side(pair[1])
      return home && away ? [{ period: week, home, away }] : []
    },
  )
  return matchups.length > 0 ? { slots, matchups } : null
}

/** Every roster in the league as a Matchup side this week. */
export function readSleeperTeamSides(
  input: Omit<Parameters<typeof readSleeperMatchup>[0], 'mine'>,
): Array<MatchupSide> {
  return input.rosters.map(
    (r) => readSleeperMatchup({ ...input, mine: r }).mine,
  )
}

/** The Viewer's roster in a league: theirs, or one they co-own. */
export function myRoster(
  rosterList: ReadonlyArray<SleeperRoster>,
  userId: string,
): SleeperRoster | undefined {
  return (
    rosterList.find((r) => r.owner_id === userId) ??
    rosterList.find((r) => r.co_owners?.includes(userId))
  )
}

export function readSleeperMatchup(input: {
  league: SleeperLeague
  rosters: ReadonlyArray<SleeperRoster>
  users: ReadonlyArray<SleeperUser>
  matchups: ReadonlyArray<SleeperMatchup>
  week: number
  mine: SleeperRoster
  data: WeekData
}): MatchupView {
  const { league, rosters: rs, users, matchups: ms, week, mine, data } = input
  const myMatchup = ms.find((m) => m.roster_id === mine.roster_id)
  const theirMatchup =
    myMatchup?.matchup_id != null
      ? ms.find(
          (m) =>
            m.matchup_id === myMatchup.matchup_id &&
            m.roster_id !== mine.roster_id,
        )
      : undefined
  const theirRoster = theirMatchup
    ? rs.find((r) => r.roster_id === theirMatchup.roster_id)
    : undefined
  return {
    sport: 'football',
    leagueName: league.name ?? `League ${league.league_id}`,
    scoringType: 'H2H_POINTS',
    matchupPeriod: week,
    scoringPeriod: week,
    mine: sideOf(league, mine, myMatchup, users, data),
    opponent: theirRoster
      ? sideOf(league, theirRoster, theirMatchup, users, data)
      : null,
  }
}

/**
 * Every other Matchup in the league this week, each read the way the
 * Viewer's is (its lower roster on the left), in matchup order; then any
 * roster Sleeper pairs with no one this week (a bye).
 */
export function readSleeperLeagueMatchups(
  input: Omit<Parameters<typeof readSleeperMatchup>[0], 'mine'>,
  myRosterId: number,
): Array<LeagueMatchup> {
  const myMatchup = input.matchups.find((m) => m.roster_id === myRosterId)
  const others = input.matchups
    .filter(
      (m) =>
        m.roster_id !== myRosterId &&
        (m.matchup_id == null || m.matchup_id !== myMatchup?.matchup_id),
    )
    .sort(
      (a, b) =>
        (a.matchup_id ?? Infinity) - (b.matchup_id ?? Infinity) ||
        a.roster_id - b.roster_id,
    )
  const paired = new Set<number>()
  const lefts = others.filter((m) => {
    if (m.matchup_id == null) return true
    if (paired.has(m.matchup_id)) return false
    paired.add(m.matchup_id)
    return true
  })
  return lefts.flatMap((m) => {
    const roster = input.rosters.find((r) => r.roster_id === m.roster_id)
    return roster
      ? [asLeagueMatchup(readSleeperMatchup({ ...input, mine: roster }))]
      : []
  })
}
