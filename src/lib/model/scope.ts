/**
 * A Timeline's Scope (CONTEXT.md): All, Following, one League, or one of
 * college football's groups (Top 25, a major Conference).
 */

import { DEFAULT_FOLLOWS } from './timeline'
import { isConference, isRowItem } from './leagues'
import type { Follow } from './timeline'
import type { RowItem } from './leagues'
import type { League } from './types'

/** Predictions: the Games the Viewer's open Predictions depend on. */
export type Scope = 'all' | 'following' | 'predictions' | RowItem

export function parseScope(value: unknown): Scope | undefined {
  if (value === 'all' || value === 'following' || value === 'predictions')
    return value
  return isRowItem(value) ? value : undefined
}

/** The Scope a Viewer starts on: their Follows if they have any. */
export function defaultScope(viewerFollows: ReadonlyArray<Follow>): Scope {
  return viewerFollows.length > 0 ? 'following' : 'all'
}

/** The Follows a Scope's Timeline is fetched with. */
export function scopeFollows(
  scope: Scope,
  viewerFollows: ReadonlyArray<Follow>,
  /** The Viewer's visible Leagues: All leaves hidden ones out. */
  leagues?: ReadonlyArray<League>,
  /** The Games the Viewer's open Predictions depend on. */
  predictionGames: ReadonlyArray<string> = [],
): ReadonlyArray<Follow> {
  const all = leagues
    ? leagues.map((league) => ({ kind: 'league' as const, league }))
    : DEFAULT_FOLLOWS
  switch (scope) {
    case 'all':
      return all
    case 'following':
      return viewerFollows.length > 0 ? viewerFollows : all
    case 'top25':
      return [{ kind: 'top25' }]
    case 'predictions':
      return predictionGames.map((gameId) => ({ kind: 'game', gameId }))
    default:
      return isConference(scope)
        ? [{ kind: 'conference', conference: scope }]
        : [{ kind: 'league', league: scope }]
  }
}
