/**
 * MLB StatsAPI → shared model. Pure: no fetching, no clock.
 *
 * An MLB Play is a completed plate appearance, or a game-relevant action
 * during one (CONTEXT.md, "Play"). Pitches are detail inside the plate
 * appearance. The plate appearance in progress is the Game's Situation, never
 * a Play.
 */

import type {
  MlbBoxTeam,
  MlbFeed,
  MlbPeople,
  MlbPlay,
  MlbPlayEvent,
  MlbPlayerStats,
  MlbRunner,
  MlbSchedule,
  MlbStatus,
  MlbTeam,
  MlbTeams,
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

/** In-PA actions that become their own Play; everything else is noise. */
const ACTION_PLAY_TYPES = new Set([
  'wild_pitch',
  'passed_ball',
  'balk',
  'pitching_substitution',
  'offensive_substitution',
  'defensive_substitution',
  'other_advance',
  'other_out',
  'error',
  'ejection',
])
const ACTION_PLAY_PREFIXES = [
  'stolen_base',
  'caught_stealing',
  'pickoff_caught_stealing',
  'pickoff_error',
  'pickoff_1b',
  'pickoff_2b',
  'pickoff_3b',
]

const NOTABLE_PLAY_TYPES = new Set([
  'triple',
  'double',
  'grounded_into_double_play',
  'double_play',
  'strikeout_double_play',
  'sac_fly_double_play',
  'triple_play',
  'ejection',
])
const NOTABLE_PLAY_PREFIXES = [
  'stolen_base',
  'caught_stealing',
  'pickoff_caught_stealing',
  'pickoff_1b',
  'pickoff_2b',
  'pickoff_3b',
]

// Sequence slots within one plate appearance (atBatIndex * PA_SLOT + …).
const PA_SLOT = 10_000
const ACTION_STEP = 10
const PA_RESULT_OFFSET = 9_990
const SEGMENT_END_OFFSET = 9_995
const START_SEQUENCE = -1
const FINAL_SEQUENCE = 1_000_000_000

function isActionPlayType(eventType: string): boolean {
  return (
    ACTION_PLAY_TYPES.has(eventType) ||
    ACTION_PLAY_PREFIXES.some((prefix) => eventType.startsWith(prefix))
  )
}

function baseSignificance(playType: string): Significance {
  if (
    NOTABLE_PLAY_TYPES.has(playType) ||
    NOTABLE_PLAY_PREFIXES.some((prefix) => playType.startsWith(prefix))
  ) {
    return 'notable'
  }
  return 'routine'
}

export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

function halfLabel(half: 'top' | 'bottom' | undefined, inning: number): string {
  return `${half === 'bottom' ? 'Bot' : 'Top'} ${ordinal(inning)}`
}

function mapStatus(status: MlbStatus): GameStatus {
  const detailed = status.detailedState ?? ''
  if (/postponed|cancelled/i.test(detailed)) return 'postponed'
  switch (status.abstractGameState) {
    case 'Final':
      return 'final'
    case 'Live':
      return /delay|suspended/i.test(detailed) ? 'delayed' : 'live'
    default:
      return 'scheduled'
  }
}

function team(t: MlbTeam): SourceTeam {
  return {
    sourceId: String(t.id),
    name: t.name,
    abbreviation: t.abbreviation ?? t.teamName ?? t.name,
    logoUrl: `https://www.mlbstatic.com/team-logos/team-cap-on-dark/${t.id}.svg`,
  }
}

/** `20261002_013248` → ISO-8601. */
function feedTimestamp(stamp: string | undefined): string | undefined {
  const m = stamp?.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/)
  if (!m) return undefined
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`
}

export function parseFeed(feed: MlbFeed): GameSnapshot {
  const { gameData, liveData } = feed
  const status = mapStatus(gameData.status)
  const away = team(gameData.teams.away)
  const home = team(gameData.teams.home)
  const names = new Map<string, string>()
  for (const p of Object.values(gameData.players ?? {})) {
    if (p?.fullName) names.set(String(p.id), p.fullName)
  }
  const nameOf = (id: number, fallback?: string) =>
    fallback ?? names.get(String(id)) ?? `#${id}`

  const allPlays = liveData.plays.allPlays
  const plays: Array<SourcePlay> = []

  // Runners on base before each plate appearance: whoever the previous one
  // in the same half-inning left on (a new half starts empty).
  let bases: Bases = EMPTY_BASES
  let half = ''
  for (const pa of allPlays) {
    const thisHalf = `${pa.about?.inning}:${pa.about?.halfInning}`
    if (thisHalf !== half) {
      bases = EMPTY_BASES
      half = thisHalf
    }
    plays.push(...actionPlays(pa, nameOf))
    if (pa.about?.isComplete) {
      const after = basesAfter(pa, nameOf)
      plays.push(plateAppearance(pa, nameOf, bases, after))
      bases = after
    }
  }

  plays.sort((a, b) => a.sequence - b.sequence)
  // A Play scores when it changes the score: robust to runs that cross the
  // plate on a wild pitch mid-PA, which the PA's own flags misattribute.
  let previous: Score = { away: 0, home: 0 }
  for (const play of plays) {
    const scored =
      play.score.away > previous.away || play.score.home > previous.home
    if (scored) play.significance = 'scoring'
    previous = play.score
  }

  const milestones = gameMilestones(feed, status, plays, away, home)
  const items: Array<SourceItem> = [...plays, ...milestones]

  const linescore = liveData.linescore
  const score: Score = {
    away: linescore?.teams?.away?.runs ?? previous.away,
    home: linescore?.teams?.home?.runs ?? previous.home,
  }

  return {
    league: 'mlb',
    sourceGameId: String(feed.gamePk),
    status,
    startsAt: gameData.datetime.dateTime,
    sportsDay: gameData.datetime.officialDate,
    away,
    home,
    score,
    situation:
      status === 'live' || status === 'delayed' ? situation(feed) : null,
    items,
    box: box(feed, away, home),
    pollHintSeconds: feed.metaData?.wait,
  }
}

interface Bases {
  first: string | null
  second: string | null
  third: string | null
}
const EMPTY_BASES: Bases = { first: null, second: null, third: null }

function basesAfter(
  pa: MlbPlay,
  nameOf: (id: number, fallback?: string) => string,
): Bases {
  // Three outs end the half: nobody is left on.
  if ((pa.count?.outs ?? 0) >= 3) return EMPTY_BASES
  const on = (p: { id: number; fullName?: string } | undefined) =>
    p ? nameOf(p.id, p.fullName) : null
  return {
    first: on(pa.matchup?.postOnFirst),
    second: on(pa.matchup?.postOnSecond),
    third: on(pa.matchup?.postOnThird),
  }
}

function plateAppearance(
  pa: MlbPlay,
  nameOf: (id: number, fallback?: string) => string,
  before: Bases,
  after: Bases,
): SourcePlay {
  const playType = pa.result?.eventType ?? 'unknown'
  const events = pa.playEvents ?? []
  const actionIndexes = new Set(
    events
      .filter(
        (e) =>
          e.type === 'action' && isActionPlayType(e.details?.eventType ?? ''),
      )
      .map((e) => e.index),
  )
  const involved = new InvolvedSet()
  const batter = pa.matchup?.batter
  const pitcher = pa.matchup?.pitcher
  if (batter)
    involved.add(batter.id, nameOf(batter.id, batter.fullName), 'batter')
  if (pitcher)
    involved.add(pitcher.id, nameOf(pitcher.id, pitcher.fullName), 'pitcher')
  for (const runner of pa.runners ?? []) {
    if (actionIndexes.has(runner.details?.playIndex ?? -1)) continue
    addRunner(involved, runner, nameOf)
  }

  const credits = runCredits(
    (pa.runners ?? []).filter(
      (r) => !actionIndexes.has(r.details?.playIndex ?? -1),
    ),
    pitcher,
    nameOf,
  )
  const pitches = events.filter((e) => e.isPitch).map(pitch)
  const hit = events.find((e) => e.hitData)?.hitData

  return {
    kind: 'play',
    key: `pa:${pa.atBatIndex}`,
    sequence: pa.atBatIndex * PA_SLOT + PA_RESULT_OFFSET,
    occurredAt:
      pa.about?.endTime ?? pa.playEndTime ?? pa.about?.startTime ?? '',
    segmentLabel: halfLabel(pa.about?.halfInning, pa.about?.inning ?? 1),
    score: { away: pa.result?.awayScore ?? 0, home: pa.result?.homeScore ?? 0 },
    description: pa.result?.description ?? pa.result?.event ?? playType,
    playType,
    significance: baseSignificance(playType),
    side: pa.about?.halfInning === 'bottom' ? 'home' : 'away',
    involved: involved.list(),
    credits,
    detail: {
      event: pa.result?.event ?? null,
      rbi: pa.result?.rbi ?? 0,
      outs: pa.count?.outs ?? null,
      batSide: pa.matchup?.batSide?.code ?? null,
      pitchHand: pa.matchup?.pitchHand?.code ?? null,
      menOnBase: pa.matchup?.splits?.menOnBase ?? null,
      reviewed: pa.about?.hasReview ?? false,
      basesBefore: { ...before },
      basesAfter: { ...after },
      pitches,
      hit: hit
        ? {
            exitVelocity: hit.launchSpeed ?? null,
            launchAngle: hit.launchAngle ?? null,
            distance: hit.totalDistance ?? null,
            trajectory: hit.trajectory ?? null,
          }
        : null,
    },
  }
}

function actionPlays(
  pa: MlbPlay,
  nameOf: (id: number, fallback?: string) => string,
): Array<SourcePlay> {
  const result: Array<SourcePlay> = []
  for (const event of pa.playEvents ?? []) {
    const playType = event.details?.eventType ?? ''
    if (event.type !== 'action' || !isActionPlayType(playType)) continue
    const involved = new InvolvedSet()
    if (event.player) {
      const role =
        playType === 'pitching_substitution'
          ? 'pitcher'
          : playType.endsWith('_substitution')
            ? 'substitute'
            : 'runner'
      involved.add(event.player.id, nameOf(event.player.id), role)
    }
    for (const runner of pa.runners ?? []) {
      if (runner.details?.playIndex === event.index) {
        addRunner(involved, runner, nameOf)
      }
    }
    result.push({
      kind: 'play',
      key: `pa:${pa.atBatIndex}:ev:${event.index}`,
      sequence: pa.atBatIndex * PA_SLOT + (event.index + 1) * ACTION_STEP,
      occurredAt: event.endTime ?? event.startTime ?? '',
      segmentLabel: halfLabel(pa.about?.halfInning, pa.about?.inning ?? 1),
      score: {
        away: event.details?.awayScore ?? 0,
        home: event.details?.homeScore ?? 0,
      },
      description: event.details?.description ?? playType,
      playType,
      significance: baseSignificance(playType),
      side: playType.endsWith('substitution')
        ? null
        : pa.about?.halfInning === 'bottom'
          ? 'home'
          : 'away',
      involved: involved.list(),
      credits: runCredits(
        (pa.runners ?? []).filter((r) => r.details?.playIndex === event.index),
        pa.matchup?.pitcher,
        nameOf,
      ),
      detail: { event: event.details?.event ?? null },
    })
  }
  return result
}

/** A charged run (and earned run) for each runner who scored. */
function runCredits(
  runners: ReadonlyArray<MlbRunner>,
  pitcher: { id: number; fullName?: string } | undefined,
  nameOf: (id: number, fallback?: string) => string,
): SourcePlay['credits'] {
  const credits: SourcePlay['credits'] = []
  for (const r of runners) {
    if (r.movement?.end !== 'score') continue
    const responsible = r.details?.responsiblePitcher ?? pitcher
    if (!responsible) continue
    const ref = {
      sourceId: String(responsible.id),
      name: nameOf(responsible.id),
    }
    credits.push({ ...ref, credit: 'run_charged' })
    if (r.details?.earned) credits.push({ ...ref, credit: 'earned_run' })
  }
  return credits
}

function addRunner(
  involved: InvolvedSet,
  runner: MlbRunner,
  nameOf: (id: number, fallback?: string) => string,
) {
  const r = runner.details?.runner
  if (r) involved.add(r.id, nameOf(r.id, r.fullName), 'runner')
  for (const credit of runner.credits ?? []) {
    if (credit.player) {
      involved.add(credit.player.id, nameOf(credit.player.id), 'fielder')
    }
  }
}

function pitch(e: MlbPlayEvent) {
  return {
    number: e.pitchNumber ?? null,
    type: e.details?.type?.description ?? null,
    typeCode: e.details?.type?.code ?? null,
    mph: e.pitchData?.startSpeed ?? null,
    call: e.details?.call?.description ?? e.details?.description ?? null,
    isStrike: e.details?.isStrike ?? false,
    isBall: e.details?.isBall ?? false,
    isInPlay: e.details?.isInPlay ?? false,
    px: e.pitchData?.coordinates?.pX ?? null,
    pz: e.pitchData?.coordinates?.pZ ?? null,
    zone: e.pitchData?.zone ?? null,
    zoneTop: e.pitchData?.strikeZoneTop ?? null,
    zoneBottom: e.pitchData?.strikeZoneBottom ?? null,
    balls: e.count?.balls ?? null,
    strikes: e.count?.strikes ?? null,
  }
}

/** Deduplicates players named more than once (e.g. batter who also scores). */
class InvolvedSet {
  private byId = new Map<string, InvolvedPlayer>()
  add(id: number, name: string, role: string) {
    const sourceId = String(id)
    if (!this.byId.has(sourceId))
      this.byId.set(sourceId, { sourceId, name, role })
  }
  list(): Array<InvolvedPlayer> {
    return [...this.byId.values()]
  }
}

function gameMilestones(
  feed: MlbFeed,
  status: GameStatus,
  plays: Array<SourcePlay>,
  away: SourceTeam,
  home: SourceTeam,
): Array<SourceMilestone> {
  const milestones: Array<SourceMilestone> = []
  const allPlays = feed.liveData.plays.allPlays
  const scoreLine = (s: Score) =>
    `${away.abbreviation} ${s.away}, ${home.abbreviation} ${s.home}`
  const lastScore = plays.at(-1)?.score ?? { away: 0, home: 0 }

  if (status === 'postponed') {
    milestones.push({
      kind: 'milestone',
      milestone: 'postponed',
      key: 'postponed',
      sequence: FINAL_SEQUENCE,
      occurredAt:
        feedTimestamp(feed.metaData?.timeStamp) ??
        feed.gameData.datetime.dateTime,
      segmentLabel: '',
      score: lastScore,
      description: `${away.abbreviation} @ ${home.abbreviation} postponed`,
    })
    return milestones
  }

  const firstPitch = allPlays
    .flatMap((pa) => pa.playEvents ?? [])
    .find((e) => e.isPitch)
  if (firstPitch) {
    milestones.push({
      kind: 'milestone',
      milestone: 'start',
      key: 'start',
      sequence: START_SEQUENCE,
      occurredAt: firstPitch.startTime ?? '',
      segmentLabel: 'Top 1st',
      score: { away: 0, home: 0 },
      description: `First pitch: ${away.abbreviation} @ ${home.abbreviation}`,
    })
  }

  // A half-inning has ended once a later half begins or it records 3 outs.
  // The final half of a finished Game is covered by the Final Milestone.
  const halves = new Map<string, Array<MlbPlay>>()
  for (const pa of allPlays) {
    const k = `${pa.about?.inning ?? 1}:${pa.about?.halfInning ?? 'top'}`
    halves.set(k, [...(halves.get(k) ?? []), pa])
  }
  const halfKeys = [...halves.keys()]
  halfKeys.forEach((k, i) => {
    const pas = halves.get(k) ?? []
    const last = pas.at(-1)
    if (!last?.about?.isComplete) return
    const isLastHalf = i === halfKeys.length - 1
    if (isLastHalf && status === 'final') return
    if (isLastHalf && (last.count?.outs ?? 0) < 3) return
    const [inning, half] = k.split(':') as [string, 'top' | 'bottom']
    const s = {
      away: last.result?.awayScore ?? 0,
      home: last.result?.homeScore ?? 0,
    }
    const label = halfLabel(half, Number(inning))
    milestones.push({
      kind: 'milestone',
      milestone: 'segment_end',
      key: `end:${k}`,
      sequence: last.atBatIndex * PA_SLOT + SEGMENT_END_OFFSET,
      occurredAt: last.about.endTime ?? last.playEndTime ?? '',
      segmentLabel: label,
      score: s,
      description: `End of ${label}: ${scoreLine(s)}`,
    })
  })

  if (status === 'delayed') {
    milestones.push({
      kind: 'milestone',
      milestone: 'delay',
      key: `delay:${allPlays.length}`,
      sequence: allPlays.length * PA_SLOT,
      occurredAt: feedTimestamp(feed.metaData?.timeStamp) ?? '',
      segmentLabel: plays.at(-1)?.segmentLabel ?? '',
      score: lastScore,
      description: `${feed.gameData.status.detailedState ?? 'Delayed'}: ${scoreLine(lastScore)}`,
    })
  }

  if (status === 'final') {
    const finalScore = {
      away: feed.liveData.linescore?.teams?.away?.runs ?? lastScore.away,
      home: feed.liveData.linescore?.teams?.home?.runs ?? lastScore.home,
    }
    const innings = feed.liveData.linescore?.currentInning ?? 9
    milestones.push({
      kind: 'milestone',
      milestone: 'final',
      key: 'final',
      sequence: FINAL_SEQUENCE,
      occurredAt: plays.at(-1)?.occurredAt ?? feed.gameData.datetime.dateTime,
      segmentLabel: innings > 9 ? `Final/${innings}` : 'Final',
      score: finalScore,
      description: `${innings > 9 ? `Final/${innings}` : 'Final'}: ${scoreLine(finalScore)}`,
    })
  }

  return milestones
}

function situation(feed: MlbFeed) {
  const ls = feed.liveData.linescore
  const inning = ls?.currentInning ?? 1
  const state = ls?.inningState ?? ls?.inningHalf ?? 'Top'
  const prefix =
    state === 'Middle'
      ? 'Mid'
      : state === 'End'
        ? 'End'
        : state === 'Bottom'
          ? 'Bot'
          : 'Top'
  return {
    segmentLabel: `${prefix} ${ordinal(inning)}`,
    detail: {
      outs: ls?.outs ?? 0,
      balls: ls?.balls ?? 0,
      strikes: ls?.strikes ?? 0,
      onFirst: Boolean(ls?.offense?.first),
      onSecond: Boolean(ls?.offense?.second),
      onThird: Boolean(ls?.offense?.third),
      batter: ls?.offense?.batter?.fullName ?? null,
      pitcher: ls?.defense?.pitcher?.fullName ?? null,
    },
  }
}

export function parseSchedule(schedule: MlbSchedule): Array<ScheduledGame> {
  return (schedule.dates ?? [])
    .flatMap((d) => d.games ?? [])
    .map((g) => ({
      league: 'mlb' as const,
      sourceGameId: String(g.gamePk),
      status: mapStatus(g.status),
      startsAt: g.gameDate,
      sportsDay: g.officialDate,
      away: team(g.teams.away.team),
      home: team(g.teams.home.team),
      score: { away: g.teams.away.score ?? 0, home: g.teams.home.score ?? 0 },
    }))
}

/**
 * MLB's headshot for a player: the square "silo" bust (head and shoulders,
 * framed like ESPN's), with MLB's generic silhouette as a fallback. The
 * usual 2:3 portrait crops at the chin in a round avatar.
 */
function mlbHeadshot(id: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/w_120,q_auto:best/v1/people/${id}/headshot/silo/current`
}

export function parseRoster(teams: MlbTeams, people: MlbPeople): SourceRoster {
  return {
    teams: (teams.teams ?? []).filter((t) => t.active !== false).map(team),
    players: (people.people ?? [])
      .filter((p) => p.active !== false)
      .map((p) => ({
        sourceId: String(p.id),
        name: p.fullName,
        teamSourceId: p.currentTeam ? String(p.currentTeam.id) : null,
        position: p.primaryPosition?.abbreviation ?? null,
        headshotUrl: mlbHeadshot(p.id),
      })),
  }
}

const BATTING_COLUMNS = ['AB', 'R', 'H', 'RBI', 'BB', 'K']
const PITCHING_COLUMNS = ['IP', 'H', 'R', 'ER', 'BB', 'K', 'NP']

function box(
  feed: MlbFeed,
  away: SourceTeam,
  home: SourceTeam,
): SourceBox | null {
  const ls = feed.liveData.linescore
  const teams = feed.liveData.boxscore?.teams
  if (!ls?.innings?.length && !teams) return null
  const innings = ls?.innings ?? []
  const totals = (side: Side) => {
    const t = ls?.teams?.[side]
    return [t?.runs ?? 0, t?.hits ?? 0, t?.errors ?? 0]
  }
  const sides: Array<[Side, MlbBoxTeam | undefined]> = [
    ['away', teams?.away],
    ['home', teams?.home],
  ]
  const tables: SourceBox['tables'] = []
  for (const [side, t] of sides) {
    if (!t) continue
    const abbreviation = side === 'away' ? away.abbreviation : home.abbreviation
    const player = (id: number) => t.players?.[`ID${id}`]
    const batters = (t.batters ?? [])
      .map(player)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.battingOrder))
      .sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder))
    tables.push({
      side,
      title: `${abbreviation} Batting`,
      columns: BATTING_COLUMNS,
      rows: batters.map((p) => {
        const b = p.stats?.batting ?? {}
        return {
          player: {
            sourceId: String(p.person.id),
            name: p.person.fullName ?? `#${p.person.id}`,
          },
          note: p.position?.abbreviation ?? null,
          sub: Number(p.battingOrder) % 100 !== 0,
          values: [
            b.atBats,
            b.runs,
            b.hits,
            b.rbi,
            b.baseOnBalls,
            b.strikeOuts,
          ].map((v) => v ?? 0),
        }
      }),
    })
    const pitchers = (t.pitchers ?? [])
      .map(player)
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
    tables.push({
      side,
      title: `${abbreviation} Pitching`,
      columns: PITCHING_COLUMNS,
      rows: pitchers.map((p, i) => {
        const s = p.stats?.pitching ?? {}
        return {
          player: {
            sourceId: String(p.person.id),
            name: p.person.fullName ?? `#${p.person.id}`,
          },
          note: null,
          sub: i > 0,
          values: [
            s.inningsPitched ?? '0.0',
            s.hits ?? 0,
            s.runs ?? 0,
            s.earnedRuns ?? 0,
            s.baseOnBalls ?? 0,
            s.strikeOuts ?? 0,
            s.numberOfPitches ?? 0,
          ],
        }
      }),
    })
  }
  return {
    linescore: {
      segments: innings.map((i) => String(i.num)),
      away: innings.map((i) => i.away?.runs ?? null),
      home: innings.map((i) => i.home?.runs ?? null),
      totalColumns: ['R', 'H', 'E'],
      awayTotals: totals('away'),
      homeTotals: totals('home'),
    },
    tables,
  }
}

const HITTING: Array<[string, string]> = [
  ['avg', 'AVG'],
  ['homeRuns', 'HR'],
  ['rbi', 'RBI'],
  ['runs', 'R'],
  ['hits', 'H'],
  ['stolenBases', 'SB'],
  ['obp', 'OBP'],
  ['ops', 'OPS'],
]
const PITCHING: Array<[string, string]> = [
  ['wins', 'W'],
  ['losses', 'L'],
  ['era', 'ERA'],
  ['inningsPitched', 'IP'],
  ['strikeOuts', 'K'],
  ['whip', 'WHIP'],
  ['saves', 'SV'],
]

/** A player's season and recent games: hitting, or pitching for a pitcher. */
export function parsePlayerOverview(r: MlbPlayerStats): PlayerOverview | null {
  const person = r.people?.[0]
  if (!person) return null
  const pitcher = person.primaryPosition?.abbreviation === 'P'
  const group = pitcher ? 'pitching' : 'hitting'
  const fields = pitcher ? PITCHING : HITTING
  const of = (type: string) =>
    person.stats?.find(
      (s) => s.type?.displayName === type && s.group?.displayName === group,
    )
  const season = of('season')?.splits?.[0]?.stat
  const log = of('gameLog')?.splits ?? []
  // The form chart's stat: a hitter's total bases, a pitcher's strikeouts.
  const formKey = pitcher ? 'strikeOuts' : 'totalBases'
  const num = (v: string | number | undefined) => {
    const n = Number(v)
    return v === undefined || !Number.isFinite(n) ? null : n
  }
  const seasonTotal = num(season?.[formKey])
  const games = num(season?.gamesPlayed)
  return {
    season: season
      ? {
          title: `${new Date().getUTCFullYear()} ${pitcher ? 'Pitching' : 'Batting'}`,
          stats: fields.map(([key, label]) => ({
            label,
            value: String(season[key] ?? '—'),
          })),
        }
      : null,
    recent: [...log]
      .reverse()
      .slice(0, 5)
      .map((g) => ({
        date: g.date ?? '',
        opponent: g.opponent?.abbreviation ?? g.opponent?.name ?? '',
        home: Boolean(g.isHome),
        result: g.isWin === undefined ? null : g.isWin ? 'W' : 'L',
        score: null,
        line: pitcher
          ? `${g.stat?.inningsPitched ?? 0} IP · ${g.stat?.strikeOuts ?? 0} K · ${g.stat?.earnedRuns ?? 0} ER`
          : `${g.stat?.hits ?? 0}-${g.stat?.atBats ?? 0} · ${g.stat?.homeRuns ?? 0} HR · ${g.stat?.rbi ?? 0} RBI`,
        value: num(g.stat?.[formKey]),
      })),
    form:
      log.length > 0
        ? {
            label: pitcher ? 'K' : 'TB',
            average: seasonTotal !== null && games ? seasonTotal / games : null,
            averageLabel: 'Season avg',
          }
        : null,
    next: null,
    news: [],
    note: null,
    fantasy: null,
  }
}
