/** How a Game's state reads in a word or two, wherever a Game is small. */

import type { GameSummary } from '@/lib/model/timeline'
import { clockTime } from '@/lib/time/format'

/** A Game's state in a word or two: its segment, Final, or start time. */
export function gameStatusLabel(
  game: GameSummary,
  timeZone: string | null,
): string {
  switch (game.status) {
    case 'live':
      return game.situation?.segmentLabel ?? 'Live'
    case 'delayed':
      return 'Delayed'
    case 'final':
      return 'Final'
    case 'postponed':
      return 'Ppd'
    default:
      return clockTime(game.startsAt, timeZone)
  }
}
