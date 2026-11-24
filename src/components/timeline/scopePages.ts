/**
 * What the Timeline can be narrowed to (the phone's home board, LiveBoard,
 * shows all but the first): first the Scope as a whole, then each thing in
 * it. Under
 * Following and All (and any League) that's the Scope's Games; under
 * Predictions the open Predictions; under Fantasy each league's Matchup.
 * With a Game open it's Games whatever the Scope, as the cards' are. Pure: the Timeline's selection (the `game`, `prediction` and
 * `matchup` in the address) says which page is current.
 */

import type { Scope } from '@/lib/model/scope'
import type { GameSummary } from '@/lib/model/timeline'
import type { PredictionView } from '@/lib/kalshi/predictionViews'
import type { FantasyLeagueView } from '@/lib/fantasy/server'

export type ScopePage =
  | { kind: 'all' }
  | { kind: 'game'; id: string; game: GameSummary }
  | { kind: 'prediction'; id: string; prediction: PredictionView }
  | { kind: 'matchup'; id: string; league: FantasyLeagueView }

/** What the bar pages through, the Scope as a whole first. */
export function scopePages({
  scope,
  gameId,
  selectedGame,
  games,
  predictions,
  leagues,
}: {
  scope: Scope
  gameId: string | null
  /** The open Game, which may not be among the Scope's (opened from a link). */
  selectedGame: GameSummary | null
  /** The Scope's Games, in the score cards' order. */
  games: ReadonlyArray<GameSummary>
  /** Open Predictions. */
  predictions: ReadonlyArray<PredictionView>
  /** Fantasy leagues with a Matchup this period. */
  leagues: ReadonlyArray<FantasyLeagueView>
}): Array<ScopePage> {
  const all: ScopePage = { kind: 'all' }
  if (!gameId && scope === 'predictions')
    return [
      all,
      ...predictions.map((p) => ({
        kind: 'prediction' as const,
        id: p.id,
        prediction: p,
      })),
    ]
  if (!gameId && scope === 'fantasy')
    return [
      all,
      ...leagues.map((l) => ({
        kind: 'matchup' as const,
        id: l.id,
        league: l,
      })),
    ]
  const shown =
    selectedGame && !games.some((g) => g.id === selectedGame.id)
      ? [selectedGame, ...games]
      : games
  return [
    all,
    ...shown.map((g) => ({ kind: 'game' as const, id: g.id, game: g })),
  ]
}

/** A page's identity across renders: 'all', or its kind and id. */
export function pageKey(page: ScopePage): string {
  return page.kind === 'all' ? 'all' : `${page.kind}:${page.id}`
}

/** The current page's key, from what the Timeline is narrowed to. */
export function currentPageKey({
  gameId,
  predictionId,
  matchupId,
}: {
  gameId: string | null
  predictionId: string | null
  matchupId: string | null
}): string {
  if (gameId) return `game:${gameId}`
  if (predictionId) return `prediction:${predictionId}`
  if (matchupId) return `matchup:${matchupId}`
  return 'all'
}

/**
 * Where a page's selection goes in the address: the Game, Prediction or
 * Matchup it narrows the Timeline to. A Game is picked within whatever
 * else is chosen, like the score cards' (so the first page, from a Game,
 * goes back to the Scope's feed as it was); a Prediction or Matchup
 * replaces the rest.
 */
export function pageSearch(
  page: ScopePage,
  gameId: string | null,
): {
  scope?: Scope
  game?: string
  prediction?: string
  matchup?: string
} {
  switch (page.kind) {
    case 'all':
      return gameId
        ? { game: undefined }
        : { game: undefined, prediction: undefined, matchup: undefined }
    case 'game':
      return { game: page.id }
    case 'prediction':
      return {
        scope: 'predictions',
        game: undefined,
        prediction: page.id,
        matchup: undefined,
      }
    case 'matchup':
      return {
        scope: 'fantasy',
        game: undefined,
        prediction: undefined,
        matchup: page.id,
      }
  }
}
