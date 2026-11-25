/**
 * A Timeline's Scope (CONTEXT.md): All, Following, Predictions, Fantasy or
 * one League, and the main navigation's four tabs over them.
 */

import { DEFAULT_FOLLOWS } from './timeline'
import { isRowItem } from './leagues'
import { isCollege } from './types'
import type { Follow } from './timeline'
import type { RowItem } from './leagues'
import type { League } from './types'

/**
 * Predictions: the Games the Viewer's open Predictions depend on. Fantasy:
 * plays by both sides' Starters in the Viewer's Matchups.
 */
export type Scope = 'all' | 'following' | 'predictions' | 'fantasy' | RowItem

export function parseScope(value: unknown): Scope | undefined {
  if (
    value === 'all' ||
    value === 'following' ||
    value === 'predictions' ||
    value === 'fantasy'
  )
    return value
  return isRowItem(value) ? value : undefined
}

/** The Scope a Viewer starts on: their Follows if they have any. */
export function defaultScope(viewerFollows: ReadonlyArray<Follow>): Scope {
  return viewerFollows.length > 0 ? 'following' : 'all'
}

/**
 * A college Game or Team the Viewer opted into (CONTEXT.md, "Opt-in"): an
 * open Prediction's Game, or a followed Team. College Leagues are covered
 * by these, never as a whole.
 */
export interface OptIn {
  league: League
  follow: Extract<Follow, { kind: 'game' } | { kind: 'team' }>
}

/** A League as Follows: the whole of it, or for college what's opted in. */
function leagueFollows(
  league: League,
  optIns: ReadonlyArray<OptIn>,
): Array<Follow> {
  return isCollege(league)
    ? optIns.filter((o) => o.league === league).map((o) => o.follow)
    : [{ kind: 'league', league }]
}

/** The Follows a Scope's Timeline is fetched with. */
export function scopeFollows(
  scope: Scope,
  viewerFollows: ReadonlyArray<Follow>,
  /** The Viewer's visible Leagues: All leaves hidden ones out. */
  leagues?: ReadonlyArray<League>,
  /** The Games the Viewer's open Predictions depend on. */
  predictionGames: ReadonlyArray<string> = [],
  /** The Players starting in the Viewer's Fantasy Matchups, either side. */
  fantasyPlayers: ReadonlyArray<string> = [],
  /** The college Games and Teams the Viewer opted into. */
  optIns: ReadonlyArray<OptIn> = [],
): ReadonlyArray<Follow> {
  const all = leagues
    ? leagues.flatMap((league) => leagueFollows(league, optIns))
    : optIns.length > 0
      ? [...DEFAULT_FOLLOWS, ...optIns.map((o) => o.follow)]
      : DEFAULT_FOLLOWS
  switch (scope) {
    case 'all':
      return all
    case 'following':
      return viewerFollows.length > 0 ? viewerFollows : all
    case 'predictions':
      return predictionGames.map((gameId) => ({ kind: 'game', gameId }))
    case 'fantasy':
      return [{ kind: 'fantasy', playerIds: [...fantasyPlayers] }]
    default:
      return leagueFollows(scope, optIns)
  }
}

/**
 * The four tabs of the main navigation, each a way into the Timeline
 * (CONTEXT.md, "Scope"), in the order the nav shows them. All stands for
 * every League-shaped Scope: All, or one League.
 */
export type ScopeTab = 'following' | 'all' | 'predictions' | 'fantasy'

export const SCOPE_TABS: ReadonlyArray<ScopeTab> = [
  'following',
  'all',
  'predictions',
  'fantasy',
]

/** The tab a Scope sits under: All for any League-shaped Scope. */
export function scopeTab(scope: Scope): ScopeTab {
  return scope === 'following' || scope === 'predictions' || scope === 'fantasy'
    ? scope
    : 'all'
}

/**
 * The Scope the Timeline shows: narrowing to one Prediction or Matchup
 * implies its Scope; otherwise the one asked for (the link, or a tab),
 * else the one last chosen on this device, else the default (Following
 * for a Viewer who follows anything, otherwise All). A Scope with nothing
 * behind it yet (no Follows, no Kalshi, no Fantasy) is still that Scope:
 * the Timeline offers to set it up rather than quietly showing another.
 */
export function resolveScope({
  requested,
  stored,
  viewerFollows,
  predictionId,
  matchupId,
}: {
  requested?: Scope
  stored?: Scope
  viewerFollows: ReadonlyArray<Follow>
  predictionId?: string | null
  matchupId?: string | null
}): Scope {
  if (predictionId) return 'predictions'
  if (matchupId) return 'fantasy'
  return requested ?? stored ?? defaultScope(viewerFollows)
}

/**
 * The Scopes a swipe steps through, in the nav's order: Following, the
 * League choice (the last one the Viewer chose under All), Predictions,
 * Fantasy. Always all four, so the order never reshuffles.
 */
export function scopeStops(lastLeague: 'all' | RowItem): Array<Scope> {
  return SCOPE_TABS.map((tab) => (tab === 'all' ? lastLeague : tab))
}

/**
 * The Scope a step moves to from `scope` (1: the next tab, -1: the one
 * before), or null at either end: it doesn't wrap. Any League choice
 * stands in the All tab's place.
 */
export function neighborScope(
  stops: ReadonlyArray<Scope>,
  scope: Scope,
  step: 1 | -1,
): Scope | null {
  const at = stops.findIndex((s) => scopeTab(s) === scopeTab(scope))
  if (at === -1) return null
  return stops[at + step] ?? null
}
