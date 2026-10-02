import { sportsDayOf } from '@/lib/model/sportsDay'

/**
 * Search params that open a Game inside the Timeline: the Timeline filtered
 * to that Game, on its Sports Day.
 */
export function gameSearch(
  gameId: string,
  sportsDay: string,
): { game: string; day?: string } {
  return sportsDay < sportsDayOf(new Date())
    ? { game: gameId, day: sportsDay }
    : { game: gameId }
}

/** A valid, unique view-transition-name for a Timeline element. */
export function vtName(id: string): string {
  return `m-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}
