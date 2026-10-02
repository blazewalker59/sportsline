/** A Timeline's Scope (CONTEXT.md): All, Following, or one League. */

import { DEFAULT_FOLLOWS } from './timeline'
import { LEAGUES } from './types'
import type { Follow } from './timeline'
import type { League } from './types'

export type Scope = 'all' | 'following' | League

export function parseScope(value: unknown): Scope | undefined {
  if (value === 'all' || value === 'following') return value
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
): ReadonlyArray<Follow> {
  switch (scope) {
    case 'all':
      return DEFAULT_FOLLOWS
    case 'following':
      return viewerFollows.length > 0 ? viewerFollows : DEFAULT_FOLLOWS
    default:
      return [{ kind: 'league', league: scope }]
  }
}
