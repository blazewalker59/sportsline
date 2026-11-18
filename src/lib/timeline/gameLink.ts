import { createContext, useContext } from 'react'
import { sportsDayOf } from '@/lib/model/sportsDay'

/**
 * Search params that open a Game inside the Timeline: the Timeline filtered
 * to that Game, on its Sports Day. It replaces any Prediction or Matchup
 * open beside the wide Timeline (the pane shows one thing at a time).
 */
export function gameSearch(
  gameId: string,
  sportsDay: string,
): { game: string; day?: string; detail?: undefined } {
  return sportsDay < sportsDayOf(new Date())
    ? { game: gameId, day: sportsDay, detail: undefined }
    : { game: gameId, detail: undefined }
}

/**
 * A Prediction or a Fantasy Matchup open beside the wide Timeline: the
 * Viewer's own Matchup in a league, or (with `teamId`) another Matchup in
 * it. Kept in the `detail` search param, like `game`, so reload and Back
 * behave the same.
 */
export type PaneDetail =
  | { kind: 'prediction'; id: string }
  | { kind: 'matchup'; leagueId: string; teamId?: number }

export function detailParam(detail: PaneDetail): string {
  return detail.kind === 'prediction'
    ? `prediction:${detail.id}`
    : `matchup:${detail.leagueId}${detail.teamId === undefined ? '' : `@${detail.teamId}`}`
}

export function parseDetail(value: string | undefined): PaneDetail | null {
  if (!value) return null
  if (value.startsWith('prediction:')) {
    const id = value.slice('prediction:'.length)
    return id ? { kind: 'prediction', id } : null
  }
  const m = /^matchup:(.+?)(?:@(\d+))?$/.exec(value)
  if (!m) return null
  return m[2] === undefined
    ? { kind: 'matchup', leagueId: m[1] }
    : { kind: 'matchup', leagueId: m[1], teamId: Number(m[2]) }
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
