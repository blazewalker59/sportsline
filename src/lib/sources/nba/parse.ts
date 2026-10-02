/**
 * ESPN NBA → shared model. Pure: no fetching, no clock.
 *
 * An NBA Play is a single game event: a shot or free throw, rebound, foul,
 * turnover, steal, block, substitution, timeout, jump ball or review
 * (CONTEXT.md, "Play"). Quarter ends become Game Milestones.
 *
 * ESPN names participants without roles, so each player's role comes from
 * how the sentence names them ("X makes … (Y assists)", "X blocks …",
 * "A enters the game for B").
 */

import {
  competitorTeam,
  mapStatus,
  quarterLabel,
  teamLogo,
} from '../espn/common'
import type { NbaRoster, NbaSummary } from './feed'
import type { NflTeams } from '../nfl/feed'
import type {
  GameSnapshot,
  InvolvedPlayer,
  Score,
  Side,
  Significance,
  SourceBox,
  SourceItem,
  SourceMilestone,
  SourcePlay,
  SourceRoster,
} from '@/lib/model/types'
import { sportsDayOf } from '@/lib/model/sportsDay'

const FINAL_SEQUENCE = 1_000_000_000

/** Momentum and officiating moments worth surfacing even when nothing scores. */
const NOTABLE =
  /block|steal|flagrant|technical|ejection|challenge|review|goaltending|jumpball|jump ball/i

const BOX_COLUMNS = [
  'MIN',
  'PTS',
  'REB',
  'AST',
  'FG',
  '3PT',
  'FT',
  'STL',
  'BLK',
  'TO',
  '+/-',
]

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** What the sentence says each named player did. */
export function roleOf(
  text: string,
  name: string,
  index: number,
  shooting: boolean,
): string {
  const n = escape(name)
  if (new RegExp(`\\(${n} assists\\)`).test(text)) return 'assist'
  if (new RegExp(`\\(${n} steals\\)`).test(text)) return 'steal'
  if (new RegExp(`^${n} blocks\\b`).test(text)) return 'blocker'
  if (new RegExp(`enters the game for ${n}\\b`).test(text)) return 'sub out'
  if (new RegExp(`^${n} enters the game`).test(text)) return 'sub in'
  if (new RegExp(`blocks ${n}\\b`).test(text)) return 'shooter'
  if (index === 0) return shooting ? 'shooter' : 'player'
  return 'player'
}

export function parseGame(summary: NbaSummary): GameSnapshot {
  const competition = summary.header.competitions[0]
  const status = mapStatus(competition.status)
  const awayC = competition.competitors.find((c) => c.homeAway === 'away')!
  const homeC = competition.competitors.find((c) => c.homeAway === 'home')!
  const away = competitorTeam('nba', awayC)
  const home = competitorTeam('nba', homeC)
  const sideOf = (teamId: string | undefined): Side | null =>
    teamId === home.sourceId ? 'home' : teamId === away.sourceId ? 'away' : null

  const names = new Map<string, string>()
  for (const t of summary.boxscore?.players ?? []) {
    for (const cat of t.statistics ?? []) {
      for (const a of cat.athletes ?? []) {
        if (a.athlete.displayName)
          names.set(a.athlete.id, a.athlete.displayName)
      }
    }
  }

  const scoreLine = (s: Score) =>
    `${away.abbreviation} ${s.away}, ${home.abbreviation} ${s.home}`
  const rows = [...(summary.plays ?? [])].sort(
    (a, b) => Number(a.sequenceNumber) - Number(b.sequenceNumber),
  )
  const plays: Array<SourcePlay> = []
  const milestones: Array<SourceMilestone> = []
  let previous: Score = { away: 0, home: 0 }
  let sawGameEnd = false

  for (const row of rows) {
    const type = row.type?.text ?? ''
    const sequence = Number(row.sequenceNumber ?? 0)
    const period = row.period?.number ?? 1
    const score = {
      away: row.awayScore ?? previous.away,
      home: row.homeScore ?? previous.home,
    }
    const occurredAt = row.wallclock ?? competition.date

    if (type === 'End Period' || type === 'End Game') {
      const final = type === 'End Game'
      sawGameEnd ||= final
      const label = final
        ? period > 4
          ? 'Final/OT'
          : 'Final'
        : period === 2
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
      previous = score
      continue
    }

    const text = (row.text ?? type).trim()
    const involved: Array<InvolvedPlayer> = []
    ;(row.participants ?? []).forEach((p, i) => {
      const id = p.athlete?.id
      if (!id || involved.some((x) => x.sourceId === id)) return
      const name = names.get(id) ?? `#${id}`
      involved.push({
        sourceId: id,
        name,
        role: roleOf(text, name, i, Boolean(row.shootingPlay)),
      })
    })

    const scored = score.away > previous.away || score.home > previous.home
    // Baskets come ~100 a game, so in the NBA only a go-ahead one (giving a
    // team the lead, from behind or from a tie) is Scoring (CONTEXT.md).
    const goAhead = scored && takesLead(previous, score)
    previous = score
    plays.push({
      kind: 'play',
      key: `play:${row.id}`,
      sequence,
      occurredAt,
      segmentLabel:
        `${quarterLabel(period)} ${row.clock?.displayValue ?? ''}`.trim(),
      score,
      description: text,
      playType: type,
      significance: significance(goAhead, type, text),
      side: sideOf(row.team?.id),
      involved,
      credits: [],
      detail: {
        type,
        points: row.scoreValue ?? 0,
        shot: Boolean(row.shootingPlay),
        x: row.coordinate?.x ?? null,
        y: row.coordinate?.y ?? null,
      },
    })
  }

  const finalScore = {
    away: Number(awayC.score ?? previous.away),
    home: Number(homeC.score ?? previous.home),
  }
  if (plays.length > 0) {
    milestones.push({
      kind: 'milestone',
      milestone: 'start',
      key: 'start',
      sequence: plays[0].sequence - 1,
      occurredAt: plays[0].occurredAt,
      segmentLabel: 'Q1',
      score: { away: 0, home: 0 },
      description: `Tip-off: ${away.abbreviation} @ ${home.abbreviation}`,
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
  const live = status === 'live' || status === 'delayed'
  const period = competition.status.period ?? 1
  return {
    league: 'nba',
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
          detail: {},
        }
      : null,
    items,
    box: box(summary, awayC, homeC),
  }
}

/** Does this score change give a team the lead it didn't have? */
export function takesLead(before: Score, after: Score): boolean {
  const awayNow = after.away > after.home
  const homeNow = after.home > after.away
  return (
    (awayNow && !(before.away > before.home)) ||
    (homeNow && !(before.home > before.away))
  )
}

function significance(
  goAhead: boolean,
  type: string,
  text: string,
): Significance {
  if (goAhead) return 'scoring'
  if (NOTABLE.test(type) || NOTABLE.test(text)) return 'notable'
  return 'routine'
}

function box(
  summary: NbaSummary,
  awayC: NbaSummary['header']['competitions'][0]['competitors'][0],
  homeC: typeof awayC,
): SourceBox | null {
  const quarters = Math.max(
    awayC.linescores?.length ?? 0,
    homeC.linescores?.length ?? 0,
  )
  const teams = summary.boxscore?.players ?? []
  if (quarters === 0 && teams.length === 0) return null
  const line = (c: typeof awayC) =>
    Array.from({ length: quarters }, (_, i) => {
      const v = c.linescores?.[i]?.displayValue
      return v == null ? null : Number(v)
    })
  const tables: SourceBox['tables'] = []
  for (const [side, c] of [
    ['away', awayC],
    ['home', homeC],
  ] as const) {
    const stats = teams.find((t) => t.team.id === c.team.id)?.statistics?.[0]
    if (!stats?.athletes?.length) continue
    const index = (name: string) => stats.names?.indexOf(name) ?? -1
    const columns = BOX_COLUMNS.filter((name) => index(name) >= 0)
    tables.push({
      side,
      title: `${c.team.abbreviation ?? c.team.id} Players`,
      columns,
      rows: stats.athletes
        .filter((a) => !a.didNotPlay)
        .map((a) => ({
          player: {
            sourceId: a.athlete.id,
            name: a.athlete.displayName ?? `#${a.athlete.id}`,
          },
          note: a.athlete.position?.abbreviation ?? null,
          sub: !a.starter,
          values: columns.map((name) => a.stats?.[index(name)] ?? ''),
        })),
    })
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

export function parseRoster(
  teams: NflTeams,
  rosters: ReadonlyArray<{ teamId: string; roster: NbaRoster }>,
): SourceRoster {
  const list = teams.sports?.[0]?.leagues?.[0]?.teams ?? []
  return {
    teams: list.map(({ team: t }) => ({
      sourceId: t.id,
      name: t.displayName ?? t.id,
      abbreviation: t.abbreviation ?? t.id,
      logoUrl: teamLogo('nba', t.abbreviation ?? t.id),
    })),
    players: rosters.flatMap(({ teamId, roster }) =>
      (roster.athletes ?? []).map((p) => ({
        sourceId: p.id,
        name: p.fullName ?? p.displayName ?? `#${p.id}`,
        teamSourceId: teamId,
        position: p.position?.abbreviation ?? null,
      })),
    ),
  }
}
