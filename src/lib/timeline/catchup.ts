/**
 * Catch-up (CONTEXT.md): what happened while the Viewer was away, from the
 * Timeline items past their Read Marker. Pure.
 */

import type { TimelineItem } from '@/lib/model/timeline'

/** Key Plays shown at most, newest first. */
const KEY_LIMIT = 30

export interface CatchUp {
  /** Items past the Read Marker, of any kind. */
  newCount: number
  /** Games that had anything happen. */
  gameCount: number
  /** Games that ended, newest first: one Final Milestone each. */
  finals: Array<TimelineItem>
  /** Scoring and Notable Plays, newest first. */
  keyPlays: Array<TimelineItem>
  scoringCount: number
}

/** The Catch-up since `readAt`, or null when there is nothing worth one. */
export function catchUp(
  items: ReadonlyArray<TimelineItem>,
  readAt: string,
): CatchUp | null {
  const fresh = items
    .filter((i) => i.occurredAt > readAt && i.status === 'active')
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const finals = fresh.filter(
    (i) => i.kind === 'milestone' && i.milestone === 'final',
  )
  const key = fresh.filter(
    (i) =>
      i.kind !== 'milestone' &&
      (i.significance === 'scoring' || i.significance === 'notable'),
  )
  if (finals.length === 0 && key.length === 0) return null
  return {
    newCount: fresh.length,
    gameCount: new Set(fresh.map((i) => i.gameId)).size,
    finals,
    keyPlays: key.slice(0, KEY_LIMIT),
    scoringCount: key.filter((i) => i.significance === 'scoring').length,
  }
}

/** "3 finals · 12 scores · 5 big plays" (empty parts left out). */
export function catchUpLine(c: CatchUp): string {
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`
  const notable = c.keyPlays.length - c.scoringCount
  return [
    c.finals.length > 0 && plural(c.finals.length, 'final', 'finals'),
    c.scoringCount > 0 && plural(c.scoringCount, 'score', 'scores'),
    notable > 0 && plural(notable, 'big play', 'big plays'),
  ]
    .filter(Boolean)
    .join(' · ')
}
