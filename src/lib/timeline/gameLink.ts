import { createContext, useContext } from 'react'
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

/** Search params that open a Play's sheet over the Timeline, on its Sports Day. */
export function playSearch(
  playId: string,
  sportsDay: string,
): { play: string; day?: string } {
  return sportsDay < sportsDayOf(new Date())
    ? { play: playId, day: sportsDay }
    : { play: playId }
}

/** A valid, unique view-transition-name for a Timeline element. */
export function vtName(id: string): string {
  return `m-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

/**
 * Whether the feed under it names its messages for View Transitions. Two
 * feeds can show the same Play (the two-pane Timeline), and a name may
 * appear only once on the page, so the second feed turns its names off.
 */
export const FeedNames = createContext(true)

/** vtName for this feed, or none where FeedNames turns names off. */
export function useVtName(): (id: string) => string | undefined {
  return useContext(FeedNames) ? vtName : noName
}

function noName(): undefined {
  return undefined
}
