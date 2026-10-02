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
