/**
 * The race on the Matchup sheet: both sides' score over the matchup
 * period, from the points sync keeps (fantasy_score_points). Pure.
 */

export interface RacePoint {
  /** ISO instant. */
  at: string
  mine: number
  opponent: number
}

/** A point is worth keeping when the score moved, or this long has passed. */
export const RACE_POINT_EVERY_MS = 10 * 60_000

export function shouldRecord(
  last: Pick<RacePoint, 'at' | 'mine' | 'opponent'> | undefined,
  next: Pick<RacePoint, 'mine' | 'opponent'>,
  now: number,
): boolean {
  if (!last) return true
  if (last.mine !== next.mine || last.opponent !== next.opponent) return true
  return now - Date.parse(last.at) >= RACE_POINT_EVERY_MS
}

/** Who's ahead at a point: 1 the Viewer, −1 the opponent, 0 level. */
const leaderOf = (p: RacePoint) => Math.sign(p.mine - p.opponent)

/** How many times the lead changed hands (a tie on the way doesn't count). */
export function leadChanges(points: ReadonlyArray<RacePoint>): number {
  let changes = 0
  let last = 0
  for (const p of points) {
    const now = leaderOf(p)
    if (now === 0) continue
    if (last !== 0 && now !== last) changes++
    last = now
  }
  return changes
}

/** One side's score at one moment, as the chart draws it. */
export interface RaceStep {
  t: number
  side: 'mine' | 'opponent'
  score: number
  /** The point this step shows (both scores), for the tooltip. */
  point: RacePoint
  /** Drawn only to make the step's corner; not a reading of its own. */
  corner: boolean
}

/**
 * Each side as a step line: scores hold until the next reading, so before
 * each change a corner repeats the previous score at the new time.
 */
export function raceSteps(
  points: ReadonlyArray<RacePoint>,
  side: RaceStep['side'],
): Array<RaceStep> {
  const out: Array<RaceStep> = []
  points.forEach((p, i) => {
    const t = Date.parse(p.at)
    const prev = points[i - 1]
    if (prev && prev[side] !== p[side])
      out.push({ t, side, score: prev[side], point: prev, corner: true })
    out.push({ t, side, score: p[side], point: p, corner: false })
  })
  return out
}
