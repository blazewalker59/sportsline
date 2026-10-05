/**
 * A Matchup side's live projection, for providers that don't send one
 * (Sleeper; ESPN sends its own): each Starter's points so far plus their
 * projection for the part of their Game still to play, the way dreamteam
 * projects. Pure.
 */

import type { LineupPlayer } from './matchup'

export interface StarterGame {
  status: string
  /** "Q3 4:31", "Halftime", "OT 2:10". */
  segmentLabel: string | null
}

/** How much of an NFL Game is played (0–1) from its clock. */
export function playedShare(game: StarterGame): number {
  if (game.status === 'final') return 1
  if (game.status !== 'live' && game.status !== 'delayed') return 0
  const label = game.segmentLabel ?? ''
  if (/half/i.test(label)) return 0.5
  if (/OT/.test(label)) return 1
  const m = /Q(\d)\s+(\d{1,2}):(\d{2})/.exec(label)
  if (!m) return 0.5
  const quarter = Number(m[1])
  const left = Number(m[2]) + Number(m[3]) / 60
  return Math.min(1, Math.max(0, ((quarter - 1) * 15 + (15 - left)) / 60))
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * Finished: what they scored. Not started: their projection. Playing:
 * their points plus the projection for the share still to play. A Starter
 * whose Game isn't known counts their points if they have any, else their
 * projection. Null when nothing is projected.
 */
export function liveProjected(
  starters: ReadonlyArray<LineupPlayer>,
  gameOf: (p: LineupPlayer) => StarterGame | undefined,
): number | null {
  if (!starters.some((p) => p.projected !== null || p.points !== null))
    return null
  let total = 0
  for (const p of starters) {
    const points = p.points ?? 0
    const projected = p.projected ?? 0
    const game = gameOf(p)
    if (!game) {
      total += p.points !== null ? points : projected
      continue
    }
    const played = playedShare(game)
    total += played >= 1 ? points : points + projected * (1 - played)
  }
  return round(total)
}
