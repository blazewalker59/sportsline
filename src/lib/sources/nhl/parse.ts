/**
 * NHL.com → shared model. Pure: no fetching, no clock.
 *
 * An NHL Play is a single game event: goal, shot, blocked or missed shot,
 * hit, faceoff, giveaway, takeaway or penalty (CONTEXT.md, "Play").
 * Stoppages and delayed-penalty signals are dropped as noise. The feed has
 * no text and no wall-clock times, so descriptions are composed here and
 * times are estimated from the game clock (`timeEstimated`).
 */

import type {
  NhlBios,
  NhlBoxscore,
  NhlClubSchedule,
  NhlPlay,
  NhlPlayByPlay,
  NhlPlayerLanding,
  NhlSchedule,
  NhlStandings,
  NhlStatsTeams,
  NhlTeam,
} from './feed'
import type {
  GameSnapshot,
  GameStatus,
  InvolvedPlayer,
  PlayerOverview,
  ScheduledGame,
  Score,
  Side,
  Significance,
  SourceBox,
  SourceItem,
  SourceMilestone,
  SourcePlay,
  SourceRoster,
  SourceTeam,
} from '@/lib/model/types'

const PLAY_TYPES = new Set([
  'goal',
  'shot-on-goal',
  'missed-shot',
  'blocked-shot',
  'hit',
  'faceoff',
  'giveaway',
  'takeaway',
  'penalty',
  'failed-shot-attempt',
])
const FINAL_SEQUENCE = 1_000_000_000

// Rough real-time pacing, for estimating when an event happened.
const PREGAME_MS = 8 * 60_000
const REAL_MS_PER_GAME_SECOND = 1_900
const PERIOD_MS = 20 * 60 * REAL_MS_PER_GAME_SECOND
const INTERMISSION_MS = 18 * 60_000

function mapStatus(
  gameState: string | undefined,
  scheduleState: string | undefined,
): GameStatus {
  if (scheduleState === 'PPD' || scheduleState === 'CNCL') return 'postponed'
  if (scheduleState === 'SUSP') return 'delayed'
  switch (gameState) {
    case 'LIVE':
    case 'CRIT':
      return 'live'
    case 'FINAL':
    case 'OFF':
      return 'final'
    default:
      return 'scheduled'
  }
}

export function periodLabel(period: {
  number: number
  periodType?: string
}): string {
  if (period.periodType === 'SO') return 'SO'
  if (period.periodType === 'OT' || period.number > 3) {
    const ot = period.number - 3
    return ot <= 1 ? 'OT' : `${ot}OT`
  }
  return ['1st', '2nd', '3rd'][period.number - 1] ?? `P${period.number}`
}

function nhlLogo(abbreviation: string): string {
  return `https://assets.nhle.com/logos/nhl/svg/${abbreviation}_dark.svg`
}

function team(t: NhlTeam): SourceTeam {
  const name = [t.placeName?.default, t.commonName?.default]
    .filter(Boolean)
    .join(' ')
  return {
    sourceId: String(t.id),
    name: name || t.abbrev,
    abbreviation: t.abbrev,
    logoUrl: nhlLogo(t.abbrev),
  }
}

function seconds(clock: string | undefined): number {
  const [m, s] = (clock ?? '0:00').split(':').map(Number)
  return (m || 0) * 60 + (s || 0)
}

/** When an event at this game-clock moment probably happened in real time. */
export function estimateTime(
  startsAt: string,
  period: number,
  timeInPeriod: string | undefined,
): string {
  const start = Date.parse(startsAt)
  const offset =
    PREGAME_MS +
    (period - 1) * (PERIOD_MS + INTERMISSION_MS) +
    seconds(timeInPeriod) * REAL_MS_PER_GAME_SECOND
  return new Date(start + offset).toISOString()
}

/**
 * Skater strength from the owning team's side, from `situationCode`
 * (away goalie, away skaters, home skaters, home goalie), e.g. "1451" is a
 * home power play.
 */
export function strength(
  code: string | undefined,
  owner: Side | null,
): string | null {
  if (!code || code.length !== 4 || !owner) return null
  const [awayGoalie, awaySkaters, homeSkaters, homeGoalie] = code
    .split('')
    .map(Number)
  const mine = owner === 'away' ? awaySkaters : homeSkaters
  const theirs = owner === 'away' ? homeSkaters : awaySkaters
  const theirGoalie = owner === 'away' ? homeGoalie : awayGoalie
  if (theirGoalie === 0) return 'empty net'
  if (mine > theirs) return 'power play'
  if (mine < theirs) return 'shorthanded'
  return mine === 5 ? 'even strength' : `${mine} on ${theirs}`
}

const humanize = (key: string | undefined) => (key ?? '').replaceAll('-', ' ')

export function parseGame(
  pbp: NhlPlayByPlay,
  box: NhlBoxscore | null,
): GameSnapshot {
  const status = mapStatus(pbp.gameState, pbp.gameScheduleState)
  const away = team(pbp.awayTeam)
  const home = team(pbp.homeTeam)
  const abbrevOf = (teamId: number | undefined) =>
    teamId === pbp.homeTeam.id
      ? home.abbreviation
      : teamId === pbp.awayTeam.id
        ? away.abbreviation
        : ''
  const sideOf = (teamId: number | undefined): Side | null =>
    teamId === pbp.homeTeam.id
      ? 'home'
      : teamId === pbp.awayTeam.id
        ? 'away'
        : null

  const names = new Map<number, string>()
  for (const r of pbp.rosterSpots ?? []) {
    names.set(
      r.playerId,
      [r.firstName?.default, r.lastName?.default].filter(Boolean).join(' ') ||
        `#${r.playerId}`,
    )
  }
  const name = (id: number | undefined) =>
    id ? (names.get(id) ?? `#${id}`) : ''

  const scoreLine = (s: Score) =>
    `${away.abbreviation} ${s.away}, ${home.abbreviation} ${s.home}`
  const rows = [...(pbp.plays ?? [])].sort(
    (a, b) => (a.sortOrder ?? a.eventId) - (b.sortOrder ?? b.eventId),
  )
  const plays: Array<SourcePlay> = []
  const milestones: Array<SourceMilestone> = []
  let score: Score = { away: 0, home: 0 }

  for (const row of rows) {
    const period = row.periodDescriptor ?? { number: 1 }
    const sequence = row.sortOrder ?? row.eventId
    const occurredAt = estimateTime(
      pbp.startTimeUTC,
      period.number,
      row.timeInPeriod,
    )
    const label = periodLabel(period)

    if (row.typeDescKey === 'period-end' || row.typeDescKey === 'game-end') {
      if (row.typeDescKey === 'game-end') continue // the Final Milestone covers it
      milestones.push({
        kind: 'milestone',
        milestone: 'segment_end',
        key: `end:${period.number}`,
        sequence,
        occurredAt,
        timeEstimated: true,
        segmentLabel: label,
        score,
        description: `End of ${period.periodType === 'REG' || !period.periodType ? `${label} period` : label}: ${scoreLine(score)}`,
      })
      continue
    }
    if (!PLAY_TYPES.has(row.typeDescKey)) continue

    const d = row.details ?? {}
    const owner = sideOf(d.eventOwnerTeamId)
    if (row.typeDescKey === 'goal') {
      score = {
        away: d.awayScore ?? score.away,
        home: d.homeScore ?? score.home,
      }
    }
    const { description, involved } = describe(
      row,
      abbrevOf(d.eventOwnerTeamId),
      name,
      strength(row.situationCode, owner),
    )
    plays.push({
      kind: 'play',
      key: `ev:${row.eventId}`,
      sequence,
      occurredAt,
      timeEstimated: true,
      segmentLabel: `${label} ${row.timeRemaining ?? ''}`.trim(),
      score,
      description,
      playType:
        row.typeDescKey === 'penalty' && d.descKey === 'fighting'
          ? 'fight'
          : row.typeDescKey,
      significance: significance(row),
      side: owner,
      involved,
      credits: [],
      detail: {
        shotType: d.shotType ?? null,
        strength: strength(row.situationCode, owner),
        zone: d.zoneCode ?? null,
        x: d.xCoord ?? null,
        y: d.yCoord ?? null,
        reason: d.reason ? humanize(d.reason) : null,
        penalty:
          row.typeDescKey === 'penalty'
            ? { infraction: humanize(d.descKey), minutes: d.duration ?? null }
            : null,
        shotsOnGoal:
          d.awaySOG != null ? { away: d.awaySOG, home: d.homeSOG ?? 0 } : null,
      },
    })
  }

  const finalScore = {
    away: pbp.awayTeam.score ?? score.away,
    home: pbp.homeTeam.score ?? score.home,
  }
  if (plays.length > 0) {
    milestones.push({
      kind: 'milestone',
      milestone: 'start',
      key: 'start',
      sequence: plays[0].sequence - 1,
      occurredAt: plays[0].occurredAt,
      timeEstimated: true,
      segmentLabel: '1st',
      score: { away: 0, home: 0 },
      description: `Puck drop: ${away.abbreviation} @ ${home.abbreviation}`,
    })
  }
  if (status === 'final') {
    const last = pbp.periodDescriptor
    const suffix =
      last?.periodType === 'SO' ? '/SO' : last?.periodType === 'OT' ? '/OT' : ''
    milestones.push({
      kind: 'milestone',
      milestone: 'final',
      key: 'final',
      sequence: FINAL_SEQUENCE,
      occurredAt:
        (plays.at(-1) ?? milestones.at(-1))?.occurredAt ?? pbp.startTimeUTC,
      timeEstimated: true,
      segmentLabel: `Final${suffix}`,
      score: finalScore,
      description: `Final${suffix}: ${scoreLine(finalScore)}`,
    })
  }
  if (status === 'postponed') {
    milestones.push({
      kind: 'milestone',
      milestone: 'postponed',
      key: 'postponed',
      sequence: FINAL_SEQUENCE,
      occurredAt: pbp.startTimeUTC,
      segmentLabel: '',
      score: finalScore,
      description: `${away.abbreviation} @ ${home.abbreviation} postponed`,
    })
  }

  const items: Array<SourceItem> = [...plays, ...milestones]
  const live = status === 'live' || status === 'delayed'
  const current = pbp.periodDescriptor ?? { number: 1 }
  const lastPlay = rows.at(-1)
  return {
    league: 'nhl',
    sourceGameId: String(pbp.id),
    status,
    startsAt: pbp.startTimeUTC,
    sportsDay: pbp.gameDate ?? pbp.startTimeUTC.slice(0, 10),
    away,
    home,
    score: finalScore,
    situation: live
      ? {
          segmentLabel: pbp.clock?.inIntermission
            ? `End of ${periodLabel(current)}`
            : `${periodLabel(current)} ${pbp.clock?.timeRemaining ?? ''}`.trim(),
          detail: {
            strength: situationText(
              lastPlay?.situationCode,
              away.abbreviation,
              home.abbreviation,
            ),
            intermission: pbp.clock?.inIntermission ?? false,
          },
        }
      : null,
    items,
    box: boxscore(box, plays, away, home),
  }
}

function significance(row: NhlPlay): Significance {
  // Goals are Scoring via the score change.
  if (row.typeDescKey === 'goal') return 'scoring'
  if (row.typeDescKey === 'penalty') return 'notable'
  return 'routine'
}

/** "EDM power play", "5 on 5", "VAN empty net"… for the Situation strip. */
function situationText(
  code: string | undefined,
  awayAbbr: string,
  homeAbbr: string,
): string | null {
  if (!code || code.length !== 4) return null
  const [ag, as, hs, hg] = code.split('').map(Number)
  if (ag === 0) return `${awayAbbr} goalie pulled`
  if (hg === 0) return `${homeAbbr} goalie pulled`
  if (as > hs) return `${awayAbbr} power play (${as} on ${hs})`
  if (hs > as) return `${homeAbbr} power play (${hs} on ${as})`
  return `${as} on ${hs}`
}

function describe(
  row: NhlPlay,
  teamAbbr: string,
  name: (id: number | undefined) => string,
  strengthLabel: string | null,
): { description: string; involved: Array<InvolvedPlayer> } {
  const d = row.details ?? {}
  const involved: Array<InvolvedPlayer> = []
  const add = (id: number | undefined, role: string) => {
    if (id && !involved.some((p) => p.sourceId === String(id))) {
      involved.push({ sourceId: String(id), name: name(id), role })
    }
  }
  const shot = d.shotType ? `, ${humanize(d.shotType)} shot` : ''
  switch (row.typeDescKey) {
    case 'goal': {
      add(d.scoringPlayerId, 'scorer')
      add(d.assist1PlayerId, 'assist')
      add(d.assist2PlayerId, 'assist')
      add(d.goalieInNetId, 'goalie')
      const assists = [
        d.assist1PlayerId &&
          `${name(d.assist1PlayerId)} (${d.assist1PlayerTotal ?? '–'})`,
        d.assist2PlayerId &&
          `${name(d.assist2PlayerId)} (${d.assist2PlayerTotal ?? '–'})`,
      ].filter(Boolean)
      const tag =
        strengthLabel === 'power play'
          ? ' Power-play goal.'
          : strengthLabel === 'shorthanded'
            ? ' Shorthanded goal.'
            : strengthLabel === 'empty net'
              ? ' Empty-net goal.'
              : ''
      return {
        description:
          `${teamAbbr} goal: ${name(d.scoringPlayerId)} (${d.scoringPlayerTotal ?? '–'})${shot}.` +
          (assists.length
            ? ` Assists: ${assists.join(', ')}.`
            : ' Unassisted.') +
          tag,
        involved,
      }
    }
    case 'shot-on-goal':
      add(d.shootingPlayerId, 'shooter')
      add(d.goalieInNetId, 'goalie')
      return {
        description: `${teamAbbr} shot on goal by ${name(d.shootingPlayerId)}${shot}${d.goalieInNetId ? `, saved by ${name(d.goalieInNetId)}` : ''}.`,
        involved,
      }
    case 'missed-shot':
      add(d.shootingPlayerId, 'shooter')
      return {
        description: `${teamAbbr} ${name(d.shootingPlayerId)} misses${d.reason ? ` (${humanize(d.reason)})` : ''}.`,
        involved,
      }
    case 'blocked-shot':
      add(d.shootingPlayerId, 'shooter')
      add(d.blockingPlayerId, 'blocker')
      return {
        description: `${name(d.shootingPlayerId)}'s shot blocked by ${teamAbbr} ${name(d.blockingPlayerId)}.`,
        involved,
      }
    case 'hit':
      add(d.hittingPlayerId, 'hitter')
      add(d.hitteePlayerId, 'hittee')
      return {
        description: `${teamAbbr} ${name(d.hittingPlayerId)} hits ${name(d.hitteePlayerId)}.`,
        involved,
      }
    case 'faceoff':
      add(d.winningPlayerId, 'winner')
      add(d.losingPlayerId, 'loser')
      return {
        description: `${teamAbbr} ${name(d.winningPlayerId)} wins the faceoff against ${name(d.losingPlayerId)}.`,
        involved,
      }
    case 'giveaway':
      add(d.playerId, 'player')
      return {
        description: `${teamAbbr} giveaway by ${name(d.playerId)}.`,
        involved,
      }
    case 'takeaway':
      add(d.playerId, 'player')
      return {
        description: `${teamAbbr} takeaway by ${name(d.playerId)}.`,
        involved,
      }
    case 'penalty': {
      add(d.committedByPlayerId ?? d.servedByPlayerId, 'penalized')
      add(d.drawnByPlayerId, 'drew penalty')
      const who = d.committedByPlayerId
        ? name(d.committedByPlayerId)
        : `${teamAbbr} bench`
      return {
        description:
          `Penalty, ${teamAbbr} ${who}: ${humanize(d.descKey)}${d.duration ? ` (${d.duration} min)` : ''}` +
          (d.drawnByPlayerId ? `, drawn by ${name(d.drawnByPlayerId)}.` : '.'),
        involved,
      }
    }
    case 'failed-shot-attempt':
      add(d.shootingPlayerId, 'shooter')
      add(d.goalieInNetId, 'goalie')
      return {
        description: `Shootout: ${teamAbbr} ${name(d.shootingPlayerId)} is stopped.`,
        involved,
      }
    default:
      return { description: humanize(row.typeDescKey), involved }
  }
}

function boxscore(
  box: NhlBoxscore | null,
  plays: Array<SourcePlay>,
  away: SourceTeam,
  home: SourceTeam,
): SourceBox | null {
  // Goals by period, from the goal Plays (the boxscore has no linescore).
  const periods = Math.max(3, ...plays.map((p) => periodIndex(p.segmentLabel)))
  const goals = (side: Side) =>
    Array.from(
      { length: periods },
      (_, i) =>
        plays.filter(
          (p) =>
            p.playType === 'goal' &&
            p.side === side &&
            periodIndex(p.segmentLabel) === i + 1,
        ).length,
    )
  const tables: SourceBox['tables'] = []
  for (const side of ['away', 'home'] as const) {
    const stats =
      box?.playerByGameStats?.[side === 'away' ? 'awayTeam' : 'homeTeam']
    const abbr = side === 'away' ? away.abbreviation : home.abbreviation
    if (!stats) continue
    const skaters = [...(stats.forwards ?? []), ...(stats.defense ?? [])]
    tables.push({
      side,
      title: `${abbr} Skaters`,
      columns: ['G', 'A', 'P', '+/-', 'SOG', 'HIT', 'PIM', 'TOI'],
      rows: skaters.map((s) => ({
        player: {
          sourceId: String(s.playerId),
          name: s.name?.default ?? `#${s.playerId}`,
        },
        note: s.position ?? null,
        sub: false,
        values: [
          s.goals ?? 0,
          s.assists ?? 0,
          s.points ?? 0,
          s.plusMinus ?? 0,
          s.sog ?? 0,
          s.hits ?? 0,
          s.pim ?? 0,
          s.toi ?? '0:00',
        ],
      })),
    })
    tables.push({
      side,
      title: `${abbr} Goalies`,
      columns: ['SV-SA', 'GA', 'SV%', 'TOI'],
      rows: (stats.goalies ?? [])
        .filter((g) => g.toi && g.toi !== '00:00')
        .map((g) => ({
          player: {
            sourceId: String(g.playerId),
            name: g.name?.default ?? `#${g.playerId}`,
          },
          note: null,
          sub: !g.starter,
          values: [
            (g.saveShotsAgainst ?? '0/0').replace('/', '-'),
            g.goalsAgainst ?? 0,
            g.savePctg != null ? g.savePctg.toFixed(3).replace(/^0/, '') : '–',
            g.toi ?? '0:00',
          ],
        })),
    })
  }
  if (plays.length === 0 && tables.length === 0) return null
  const sog = (t: NhlBoxscore['awayTeam']) => t?.sog ?? 0
  const awayGoals = goals('away')
  const homeGoals = goals('home')
  return {
    linescore: {
      segments: Array.from({ length: periods }, (_, i) =>
        i < 3 ? String(i + 1) : i === 3 ? 'OT' : `${i - 2}OT`,
      ),
      away: awayGoals,
      home: homeGoals,
      totalColumns: ['G', 'SOG'],
      awayTotals: [
        box?.awayTeam?.score ?? awayGoals.reduce((a, b) => a + b, 0),
        sog(box?.awayTeam),
      ],
      homeTotals: [
        box?.homeTeam?.score ?? homeGoals.reduce((a, b) => a + b, 0),
        sog(box?.homeTeam),
      ],
    },
    tables,
  }
}

function periodIndex(segmentLabel: string): number {
  const label = segmentLabel.split(' ')[0]
  if (label === '1st') return 1
  if (label === '2nd') return 2
  if (label === '3rd') return 3
  if (label === 'OT') return 4
  const ot = label.match(/^(\d+)OT$/)
  return ot ? 3 + Number(ot[1]) : 0
}

export function parseSchedule(
  schedule: NhlSchedule,
  sportsDay: string,
): Array<ScheduledGame> {
  const day = schedule.gameWeek?.find((d) => d.date === sportsDay)
  return (day?.games ?? []).map((g) => ({
    league: 'nhl' as const,
    sourceGameId: String(g.id),
    status: mapStatus(g.gameState, g.gameScheduleState),
    startsAt: g.startTimeUTC,
    sportsDay,
    away: team(g.awayTeam),
    home: team(g.homeTeam),
    score: { away: g.awayTeam.score ?? 0, home: g.homeTeam.score ?? 0 },
  }))
}

/** A club's regular season and playoff Games (preseason left out). */
export function parseClubSchedule(
  schedule: NhlClubSchedule,
): Array<ScheduledGame> {
  return (schedule.games ?? [])
    .filter((g) => g.gameType === 2 || g.gameType === 3)
    .map((g) => ({
      league: 'nhl' as const,
      sourceGameId: String(g.id),
      status: mapStatus(g.gameState, g.gameScheduleState),
      startsAt: g.startTimeUTC,
      sportsDay: g.gameDate,
      away: team(g.awayTeam),
      home: team(g.homeTeam),
      score: { away: g.awayTeam.score ?? 0, home: g.homeTeam.score ?? 0 },
      overtime:
        g.gameOutcome?.lastPeriodType === 'OT' ||
        g.gameOutcome?.lastPeriodType === 'SO',
    }))
}

/**
 * Teams from the stats API and standings; Players from season bios (this
 * season's and last, so a player yet to appear this season is still
 * listed). A player without a current team is left out.
 */
export function parseRoster(
  teams: NhlStatsTeams,
  standings: NhlStandings,
  bios: ReadonlyArray<NhlBios>,
  /** The current season ("20262027"), for headshot paths. */
  season?: string,
): SourceRoster {
  const current = new Set(
    (standings.standings ?? []).flatMap((s) =>
      s.teamAbbrev?.default ? [s.teamAbbrev.default] : [],
    ),
  )
  // The stats API keeps retired franchises and can list a code twice (Utah's
  // 2024 club and the Mammoth); the current one has the highest id.
  const byCode = new Map<
    string,
    { id: number; fullName?: string; triCode?: string }
  >()
  for (const t of teams.data ?? []) {
    if (!t.triCode || !current.has(t.triCode)) continue
    const seen = byCode.get(t.triCode)
    if (!seen || t.id > seen.id) byCode.set(t.triCode, t)
  }
  const list = [...byCode.values()]
  const idByAbbrev = new Map(list.map((t) => [t.triCode!, String(t.id)]))
  return {
    teams: list.map((t) => ({
      sourceId: String(t.id),
      name: t.fullName ?? t.triCode!,
      abbreviation: t.triCode!,
      logoUrl: nhlLogo(t.triCode!),
    })),
    players: [
      ...new Map(
        bios
          .flatMap((b) => b.data ?? [])
          .flatMap((p) => {
            const teamSourceId = p.currentTeamAbbrev
              ? idByAbbrev.get(p.currentTeamAbbrev)
              : undefined
            if (!teamSourceId) return []
            const player = {
              sourceId: String(p.playerId),
              name: p.skaterFullName ?? p.goalieFullName ?? `#${p.playerId}`,
              teamSourceId,
              position: p.positionCode ?? (p.goalieFullName ? 'G' : null),
              headshotUrl: season
                ? `https://assets.nhle.com/mugs/nhl/${season}/${p.currentTeamAbbrev}/${p.playerId}.png`
                : null,
            }
            return [[player.sourceId, player] as const]
          }),
      ).values(),
    ],
  }
}

/** A player's season and last five games, from their NHL.com page. */
export function parsePlayerLanding(d: NhlPlayerLanding): PlayerOverview {
  const goalie = d.position === 'G'
  const season = d.featuredStats?.regularSeason?.subSeason
  const whole = (n?: number) => (n === undefined ? '—' : String(n))
  const pct = (n?: number) =>
    n === undefined ? '—' : n.toFixed(3).replace(/^0/, '')
  const fields: Array<[string, string, (n?: number) => string]> = goalie
    ? [
        ['gamesPlayed', 'GP', whole],
        ['wins', 'W', whole],
        [
          'goalsAgainstAvg',
          'GAA',
          (n) => (n === undefined ? '—' : n.toFixed(2)),
        ],
        ['savePctg', 'SV%', pct],
        ['shutouts', 'SO', whole],
      ]
    : [
        ['gamesPlayed', 'GP', whole],
        ['goals', 'G', whole],
        ['assists', 'A', whole],
        ['points', 'P', whole],
        ['plusMinus', '+/-', whole],
        ['shots', 'SOG', whole],
      ]
  const year = d.featuredStats?.season
  return {
    season: season
      ? {
          title: year
            ? `${String(year).slice(0, 4)}-${String(year).slice(6)} Season`
            : 'Season',
          stats: fields.map(([key, label, show]) => ({
            label,
            value: show(season[key]),
          })),
        }
      : null,
    recent: (d.last5Games ?? []).map((g) => ({
      date: g.gameDate ?? '',
      opponent: g.opponentAbbrev ?? '',
      home: g.homeRoadFlag === 'H',
      result: g.decision ?? null,
      score: null,
      line: goalie
        ? `${pct(g.savePctg)} SV% · ${g.goalsAgainst ?? 0} GA`
        : `${g.goals ?? 0} G · ${g.assists ?? 0} A · ${g.shots ?? 0} SOG · ${g.toi ?? ''} TOI`,
      // The form chart's stat: a skater's points, a goalie's save %.
      value: (goalie ? g.savePctg : g.points) ?? null,
    })),
    form:
      (d.last5Games ?? []).length > 0
        ? {
            label: goalie ? 'SV%' : 'P',
            average: goalie
              ? (season?.savePctg ?? null)
              : season?.points !== undefined && season.gamesPlayed
                ? season.points / season.gamesPlayed
                : null,
            averageLabel: 'Season avg',
          }
        : null,
    next: null,
    news: [],
    note: null,
    fantasy: null,
  }
}
