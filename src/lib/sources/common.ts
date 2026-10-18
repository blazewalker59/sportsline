/**
 * What every League's parser builds the same way, whatever its Source: the
 * Final's place in the Game, score lines, lead changes, the start, final
 * and postponement Game Milestones, and which season a date falls in.
 */

import type {
  GameStatus,
  Score,
  SourceMilestone,
  SourcePlay,
  SourceTeam,
} from '@/lib/model/types'

/** A Final or postponement sorts after everything else in its Game. */
export const FINAL_SEQUENCE = 1_000_000_000

interface Teams {
  away: SourceTeam
  home: SourceTeam
}

/** "BOS 3, NYY 2". */
export function scoreLine({ away, home }: Teams, s: Score): string {
  return `${away.abbreviation} ${s.away}, ${home.abbreviation} ${s.home}`
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

/** Only Milestones timed from a Play carry an estimate. */
const estimated = (timeEstimated: boolean | undefined) =>
  timeEstimated ? { timeEstimated: true } : {}

/** The Game under way, just before its first Play ("Tip-off: BOS @ NYK"). */
export function startMilestone(
  teams: Teams,
  start: {
    sequence: number
    occurredAt: string
    segmentLabel: string
    /** What starts a Game in this League: "Kickoff", "Puck drop"… */
    verb: string
    timeEstimated?: boolean
  },
): SourceMilestone {
  return {
    kind: 'milestone',
    milestone: 'start',
    key: 'start',
    sequence: start.sequence,
    occurredAt: start.occurredAt,
    ...estimated(start.timeEstimated),
    segmentLabel: start.segmentLabel,
    score: { away: 0, home: 0 },
    description: `${start.verb}: ${teams.away.abbreviation} @ ${teams.home.abbreviation}`,
  }
}

/** The Final, labelled "Final", "Final/OT", "Final/11"… */
export function finalMilestone(
  teams: Teams,
  final: {
    label: string
    occurredAt: string
    score: Score
    timeEstimated?: boolean
  },
): SourceMilestone {
  return {
    kind: 'milestone',
    milestone: 'final',
    key: 'final',
    sequence: FINAL_SEQUENCE,
    occurredAt: final.occurredAt,
    ...estimated(final.timeEstimated),
    segmentLabel: final.label,
    score: final.score,
    description: `${final.label}: ${scoreLine(teams, final.score)}`,
  }
}

export function postponedMilestone(
  teams: Teams,
  occurredAt: string,
  score: Score,
): SourceMilestone {
  return {
    kind: 'milestone',
    milestone: 'postponed',
    key: 'postponed',
    sequence: FINAL_SEQUENCE,
    occurredAt,
    segmentLabel: '',
    score,
    description: `${teams.away.abbreviation} @ ${teams.home.abbreviation} postponed`,
  }
}

/**
 * The start, final and postponement Milestones for a League whose Game
 * starts with its first Play: a start once there are Plays, a Final once
 * the Game is final (unless `finalLabel` is null, when the Source's own
 * game end already made one), and a postponement.
 */
export function gameMilestones(
  teams: Teams,
  game: {
    status: GameStatus
    plays: ReadonlyArray<SourcePlay>
    startsAt: string
    /** The Game's score as the Source reports it, for the Final. */
    score: Score
    start: { segmentLabel: string; verb: string }
    finalLabel: string | null
    /** When the Final happened; by default, the last Play's time. */
    finalAt?: string
    /** Plays' times are estimated, so the start's and Final's are too. */
    timeEstimated?: boolean
  },
): Array<SourceMilestone> {
  const milestones: Array<SourceMilestone> = []
  const first = game.plays.at(0)
  if (first) {
    milestones.push(
      startMilestone(teams, {
        ...game.start,
        sequence: first.sequence - 1,
        occurredAt: first.occurredAt,
        timeEstimated: game.timeEstimated,
      }),
    )
  }
  if (game.status === 'final' && game.finalLabel !== null) {
    milestones.push(
      finalMilestone(teams, {
        label: game.finalLabel,
        occurredAt:
          game.finalAt ?? game.plays.at(-1)?.occurredAt ?? game.startsAt,
        score: game.score,
        timeEstimated: game.timeEstimated,
      }),
    )
  }
  if (game.status === 'postponed') {
    milestones.push(postponedMilestone(teams, game.startsAt, game.score))
  }
  return milestones
}

/**
 * The year of the season under way on `now` (or the last one, between
 * seasons), for a League whose season opens in `opensInMonth` (a UTC month,
 * 0 for January) and is named for the year it opens.
 */
export function seasonYear(now: Date, opensInMonth: number): number {
  return now.getUTCFullYear() - (now.getUTCMonth() < opensInMonth ? 1 : 0)
}
