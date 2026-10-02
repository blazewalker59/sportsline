/**
 * MLB StatsAPI → shared model. Pure: no fetching, no clock.
 *
 * An MLB Play is a completed plate appearance, or a game-relevant action
 * during one (CONTEXT.md, "Play"). Pitches are detail inside the plate
 * appearance. The plate appearance in progress is the Game's Situation, never
 * a Play.
 */

import type {
  MlbFeed,
  MlbPlay,
  MlbPlayEvent,
  MlbRunner,
  MlbSchedule,
  MlbStatus,
  MlbTeam,
} from './feed'
import type {
  GameSnapshot,
  GameStatus,
  InvolvedPlayer,
  ScheduledGame,
  Score,
  Significance,
  SourceItem,
  SourceMilestone,
  SourcePlay,
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

export function isActionPlayType(eventType: string): boolean {
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

export function mapStatus(status: MlbStatus): GameStatus {
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

  for (const pa of allPlays) {
    plays.push(...actionPlays(pa, nameOf))
    if (pa.about?.isComplete) plays.push(plateAppearance(pa, nameOf))
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
    pollHintSeconds: feed.metaData?.wait,
  }
}

function plateAppearance(
  pa: MlbPlay,
  nameOf: (id: number, fallback?: string) => string,
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
    detail: {
      event: pa.result?.event ?? null,
      rbi: pa.result?.rbi ?? 0,
      outs: pa.count?.outs ?? null,
      batSide: pa.matchup?.batSide?.code ?? null,
      pitchHand: pa.matchup?.pitchHand?.code ?? null,
      menOnBase: pa.matchup?.splits?.menOnBase ?? null,
      reviewed: pa.about?.hasReview ?? false,
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
      detail: { event: event.details?.event ?? null },
    })
  }
  return result
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
