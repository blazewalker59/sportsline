/** A Timeline's Scope (CONTEXT.md): All, Following, one League, or Top 25. */

import { DEFAULT_FOLLOWS } from './timeline'
import { LEAGUES } from './types'
import type { Follow } from './timeline'
import type { League } from './types'

export type Scope = 'all' | 'following' | 'top25' | League

export function parseScope(value: unknown): Scope | undefined {
  if (value === 'all' || value === 'following' || value === 'top25')
    return value
  return (LEAGUES as ReadonlyArray<unknown>).includes(value)
    ? (value as League)
    : undefined
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
    default:
      return [{ kind: 'league', league: scope }]
  }
}
