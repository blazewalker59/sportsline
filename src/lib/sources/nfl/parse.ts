/**
 * ESPN NFL → shared model. Pure: no fetching, no clock.
 *
 * An NFL Play is a snap, including penalties and team timeouts (CONTEXT.md,
 * "Play"). Quarter and half ends become Game Milestones; TV timeouts, the
 * coin toss and the two-minute warning are dropped as noise.
 */

import {
  competitorTeam,
  mapStatus,
  parseScoreboard as parseEspnScoreboard,
  quarterLabel,
  refId,
  teamLogo,
} from '../espn/common'
import type {
  EspnCompetitor,
  NflCorePlay,
  NflCorePlays,
  NflRoster,
  NflScoreboard,
  NflSummary,
  NflTeams,
} from './feed'
import type {
  GameSnapshot,
  InvolvedPlayer,
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
import { sportsDayOf } from '@/lib/model/sportsDay'

export { quarterLabel }

const NOISE_TYPES = new Set([
  'Official Timeout',
  'Coin Toss',
  'Two-minute warning',
])
const SEGMENT_END_TYPES = new Set(['End Period', 'End of Half'])
const GAME_END_TYPES = new Set(['End of Game'])
const NOTABLE_TYPES = new Set([
  'Sack',
  'Pass Interception Return',
  'Interception Return Touchdown',
  'Fumble Recovery (Opponent)',
  'Fumble Return Touchdown',
  'Field Goal Missed',
  'Blocked Field Goal',
  'Blocked Punt',
  'Safety',
])
/** A gain of at least this many yards is Notable. */
const BIG_PLAY_YARDS = 20
const NO_FOURTH_DOWN_ATTEMPT = new Set([
  'Punt',
  'Field Goal Good',
  'Field Goal Missed',
  'Penalty',
  'Timeout',
])
const FINAL_SEQUENCE = 1_000_000_000

const team = (c: EspnCompetitor): SourceTeam => competitorTeam('nfl', c)

export function parseGame(
  summary: NflSummary,
  core: NflCorePlays,
): GameSnapshot {
  const competition = summary.header.competitions[0]
  const status = mapStatus(competition.status)
  const awayC = competition.competitors.find((c) => c.homeAway === 'away')!
  const homeC = competition.competitors.find((c) => c.homeAway === 'home')!
  const away = team(awayC)
  const home = team(homeC)
  const sideOf = (teamId: string | null): Side | null =>
    teamId === home.sourceId ? 'home' : teamId === away.sourceId ? 'away' : null

  // Names come from the box score; anyone it omits (a penalized lineman) is
  // named by the roster sync instead.
  const names = new Map<string, string>()
  for (const t of summary.boxscore?.players ?? []) {
    for (const cat of t.statistics ?? []) {
      for (const a of cat.athletes ?? []) {
        if (a.athlete.displayName)
          names.set(a.athlete.id, a.athlete.displayName)
      }
    }
  }

  // Drive context and wall-clock times live on the summary's drives.
  const drives = [
    ...(summary.drives?.previous ?? []),
    ...(summary.drives?.current ? [summary.drives.current] : []),
  ]
  const playDrive = new Map<
    string,
    { number: number; description: string | null; result: string | null }
  >()
  const wallclock = new Map<string, string>()
  drives.forEach((d, i) => {
    for (const p of d.plays ?? []) {
      playDrive.set(p.id, {
        number: i + 1,
        description: d.description ?? null,
        result: d.displayResult ?? null,
      })
      if (p.wallclock) wallclock.set(p.id, p.wallclock)
    }
  })

  const scoreLine = (s: Score) =>
    `${away.abbreviation} ${s.away}, ${home.abbreviation} ${s.home}`
  const rows = [...(core.items ?? [])].sort(
    (a, b) => Number(a.sequenceNumber) - Number(b.sequenceNumber),
  )
  const plays: Array<SourcePlay> = []
  const milestones: Array<SourceMilestone> = []
  let previous: Score = { away: 0, home: 0 }
  let sawGameEnd = false

  for (const row of rows) {
    const type = row.type?.text ?? ''
    if (NOISE_TYPES.has(type)) continue
    const sequence = Number(row.sequenceNumber ?? 0)
    const period = row.period?.number ?? 1
    const score = {
      away: row.awayScore ?? previous.away,
      home: row.homeScore ?? previous.home,
    }
    const occurredAt = wallclock.get(row.id) ?? row.modified ?? competition.date

    if (SEGMENT_END_TYPES.has(type) || GAME_END_TYPES.has(type)) {
      const final = GAME_END_TYPES.has(type)
      sawGameEnd ||= final
      const label = final
        ? period > 4
          ? 'Final/OT'
          : 'Final'
        : type === 'End of Half'
          ? 'Halftime'
          : `End of ${quarterLabel(period)}`
      milestones.push({
        kind: 'milestone',
        milestone: final ? 'final' : 'segment_end',
        key: final ? 'final' : `end:${period}`,
        sequence: final ? FINAL_SEQUENCE : sequence,
        occurredAt,
        segmentLabel: final ? label : quarterLabel(period),
        score,
        description: `${label}: ${scoreLine(score)}`,
      })
      continue
    }

    const involved = new Map<string, InvolvedPlayer>()
    for (const p of [...(row.participants ?? [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    )) {
      const id = refId(p.athlete?.$ref, 'athletes')
      if (!id || involved.has(id)) continue
      involved.set(id, {
        sourceId: id,
        name: names.get(id) ?? `#${id}`,
        role: p.type ?? 'player',
      })
    }

    const scored = score.away > previous.away || score.home > previous.home
    previous = score
    const drive = playDrive.get(row.id) ?? null
    plays.push({
      kind: 'play',
      key: `play:${row.id}`,
      sequence,
      occurredAt,
      segmentLabel:
        `${quarterLabel(period)} ${row.clock?.displayValue ?? ''}`.trim(),
      score,
      description: (row.text ?? type).trim(),
      playType: type,
      significance: scored ? 'scoring' : significance(row, type),
      side: sideOf(refId(row.team?.$ref, 'teams')),
      involved: [...involved.values()],
      credits: [],
      detail: {
        type,
        yards: row.statYardage ?? null,
        before: row.start?.downDistanceText ?? null,
        after: row.end?.downDistanceText ?? null,
        down: row.start?.down ?? null,
        distance: row.start?.distance ?? null,
        isPenalty: row.isPenalty ?? false,
        isTurnover: row.isTurnover ?? false,
        drive,
      },
    })
  }

  const finalScore = {
    away: Number(awayC.score ?? previous.away),
    home: Number(homeC.score ?? previous.home),
  }
  if (plays.length > 0) {
    const first = plays[0]
    milestones.push({
      kind: 'milestone',
      milestone: 'start',
      key: 'start',
      sequence: first.sequence - 1,
      occurredAt: first.occurredAt,
      segmentLabel: 'Q1',
      score: { away: 0, home: 0 },
      description: `Kickoff: ${away.abbreviation} @ ${home.abbreviation}`,
    })
  }
  if (status === 'final' && !sawGameEnd) {
    milestones.push({
      kind: 'milestone',
      milestone: 'final',
      key: 'final',
      sequence: FINAL_SEQUENCE,
      occurredAt: plays.at(-1)?.occurredAt ?? competition.date,
      segmentLabel: 'Final',
      score: finalScore,
      description: `Final: ${scoreLine(finalScore)}`,
    })
  }
  if (status === 'postponed') {
    milestones.push({
      kind: 'milestone',
      milestone: 'postponed',
      key: 'postponed',
      sequence: FINAL_SEQUENCE,
      occurredAt: competition.date,
      segmentLabel: '',
      score: finalScore,
      description: `${away.abbreviation} @ ${home.abbreviation} postponed`,
    })
  }

  const items: Array<SourceItem> = [...plays, ...milestones]
  const lastPlay = rows
    .filter((r) => !NOISE_TYPES.has(r.type?.text ?? ''))
    .at(-1)
  const possession =
    refId(lastPlay?.end?.team?.$ref, 'teams') ?? lastPlay?.end?.team?.id ?? null
  const period = competition.status.period ?? 1
  const live = status === 'live' || status === 'delayed'

  return {
    league: 'nfl',
    sourceGameId: summary.header.id,
    status,
    startsAt: competition.date,
    sportsDay: sportsDayOf(new Date(competition.date)),
    away,
    home,
    score: finalScore,
    situation: live
      ? {
          segmentLabel:
            competition.status.type?.name === 'STATUS_HALFTIME'
              ? 'Halftime'
              : `${quarterLabel(period)} ${competition.status.displayClock ?? ''}`.trim(),
          detail: {
            downDistance: lastPlay?.end?.downDistanceText ?? null,
            possession:
              possession === home.sourceId
                ? home.abbreviation
                : possession === away.sourceId
                  ? away.abbreviation
                  : null,
          },
        }
      : null,
    items,
    box: box(summary, awayC, homeC),
  }
}

function significance(row: NflCorePlay, type: string): Significance {
  if (row.isTurnover || NOTABLE_TYPES.has(type)) return 'notable'
  if (row.start?.down === 4 && !NO_FOURTH_DOWN_ATTEMPT.has(type))
    return 'notable'
  if (
    (type === 'Rush' || type === 'Pass Reception') &&
    (row.statYardage ?? 0) >= BIG_PLAY_YARDS
  )
    return 'notable'
  return 'routine'
}

const BOX_CATEGORIES: Array<[string, string]> = [
  ['passing', 'Passing'],
  ['rushing', 'Rushing'],
  ['receiving', 'Receiving'],
  ['defensive', 'Defense'],
]

function box(
  summary: NflSummary,
  awayC: EspnCompetitor,
  homeC: EspnCompetitor,
): SourceBox | null {
  const quarters = Math.max(
    awayC.linescores?.length ?? 0,
    homeC.linescores?.length ?? 0,
  )
  const teams = summary.boxscore?.players ?? []
  if (quarters === 0 && teams.length === 0) return null
  const line = (c: EspnCompetitor) =>
    Array.from({ length: quarters }, (_, i) => {
      const v = c.linescores?.[i]?.displayValue
      return v == null ? null : Number(v)
    })
  const tables: SourceBox['tables'] = []
  for (const [category, title] of BOX_CATEGORIES) {
    for (const [side, c] of [
      ['away', awayC],
      ['home', homeC],
    ] as const) {
      const stats = teams
        .find((t) => t.team.id === c.team.id)
        ?.statistics?.find((s) => s.name === category)
      if (!stats?.athletes?.length) continue
      tables.push({
        side,
        title: `${c.team.abbreviation ?? c.team.id} ${title}`,
        columns: stats.labels ?? [],
        rows: stats.athletes.map((a) => ({
          player: {
            sourceId: a.athlete.id,
            name: a.athlete.displayName ?? `#${a.athlete.id}`,
          },
          note: null,
          sub: false,
          values: a.stats ?? [],
        })),
      })
    }
  }
  return {
    linescore: {
      segments: Array.from({ length: quarters }, (_, i) =>
        i < 4 ? String(i + 1) : quarterLabel(i + 1),
      ),
      away: line(awayC),
      home: line(homeC),
      totalColumns: ['T'],
      awayTotals: [Number(awayC.score ?? 0)],
      homeTotals: [Number(homeC.score ?? 0)],
    },
    tables,
  }
}

export function parseScoreboard(
  scoreboard: NflScoreboard,
): Array<ScheduledGame> {
  return parseEspnScoreboard(scoreboard, 'nfl')
}

export function parseRoster(
  teams: NflTeams,
  rosters: ReadonlyArray<{ teamId: string; roster: NflRoster }>,
): SourceRoster {
  const list = teams.sports?.[0]?.leagues?.[0]?.teams ?? []
  return {
    teams: list.map(({ team: t }) => ({
      sourceId: t.id,
      name: t.displayName ?? t.id,
      abbreviation: t.abbreviation ?? t.id,
      logoUrl: teamLogo('nfl', t.abbreviation ?? t.id),
    })),
    players: rosters.flatMap(({ teamId, roster }) =>
      (roster.athletes ?? []).flatMap((group) =>
        (group.items ?? []).map((p) => ({
          sourceId: p.id,
          name: p.fullName ?? p.displayName ?? `#${p.id}`,
          teamSourceId: teamId,
          position: p.position?.abbreviation ?? null,
        })),
      ),
    ),
  }
}
