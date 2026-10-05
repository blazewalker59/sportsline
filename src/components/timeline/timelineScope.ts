/**
 * What a Timeline covers (CONTEXT.md, "Scope"): the remembered Scope, what
 * one selected Prediction or Fantasy Matchup covers, and which Games belong
 * on the score cards. Pure, apart from the remembered Scope's storage.
 */

import type { Scope } from '@/lib/model/scope'
import type { Follow, GameSummary } from '@/lib/model/timeline'
import type { PredictionView } from '@/lib/kalshi/server'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { League } from '@/lib/model/types'
import { parseScope } from '@/lib/model/scope'
import { inConference, isRanked } from '@/lib/model/timeline'
import { isConference } from '@/lib/model/leagues'

const SCOPE_KEY = 'sportsline:scope'

/** The Scope last chosen on this device, if any (and still a Scope). */
export function readStoredScope(): Scope | undefined {
  try {
    return parseScope(localStorage.getItem(SCOPE_KEY))
  } catch {
    return undefined
  }
}

export function storeScope(scope: Scope): void {
  try {
    localStorage.setItem(SCOPE_KEY, scope)
  } catch {
    // Private mode: the Scope just isn't remembered.
  }
}

/**
 * What one Prediction covers: plays naming each Player a Leg is about, and
 * the whole Game for every other Leg.
 */
export function predictionFollows(p: PredictionView): Array<Follow> {
  const out = new Map<string, Follow>()
  for (const leg of p.legs) {
    if (leg.playerId)
      out.set(`p:${leg.playerId}`, { kind: 'player', playerId: leg.playerId })
    else if (leg.game)
      out.set(`g:${leg.game.id}`, { kind: 'game', gameId: leg.game.id })
  }
  return [...out.values()]
}

/**
 * What one Fantasy Matchup covers: plays naming either side's Starters.
 * (Unmatched Starters, team defenses among them, can't be followed by play.)
 */
export function matchupFollows(league: FantasyLeagueView): Array<Follow> {
  const m = league.matchup
  const ids = [...(m?.mine.lineup ?? []), ...(m?.opponent?.lineup ?? [])]
    .filter((p) => p.starter && p.playerId)
    .map((p) => p.playerId!)
  // As Player Follows (a few dozen ids at most); with no Starters matched
  // yet, an id that covers nothing rather than every league's.
  return (ids.length ? [...new Set(ids)] : ['pl_none']).map((playerId) => ({
    kind: 'player' as const,
    playerId,
  }))
}

/** Does this Game belong on the score cards for the Scope? */
export function inScope(
  game: GameSummary,
  scope: Scope,
  viewerFollows: ReadonlyArray<Follow>,
  items: ReadonlyArray<{ gameId: string }>,
  leagues: ReadonlyArray<League>,
  predictionGames: ReadonlyArray<string>,
): boolean {
  if (scope === 'all') return leagues.includes(game.league)
  if (scope === 'predictions') return predictionGames.includes(game.id)
  // Fantasy: the Games the Starters' plays came from.
  if (scope === 'fantasy') return items.some((i) => i.gameId === game.id)
  if (scope === 'top25') return game.league === 'cfb' && isRanked(game)
  if (isConference(scope))
    return game.league === 'cfb' && inConference(game, scope)
  if (scope !== 'following') return game.league === scope
  // Player Follows can't be judged from the Game alone: include any Game
  // that has Plays on this Timeline.
  return (
    followsGame(game, viewerFollows) || items.some((i) => i.gameId === game.id)
  )
}

/** Is this live Game one the Viewer's Follows cover (for its typing indicator)? */
export function followsGame(
  game: GameSummary,
  follows: ReadonlyArray<Follow>,
): boolean {
  return follows.some((f) =>
    f.kind === 'league'
      ? f.league === game.league
      : f.kind === 'team'
        ? f.teamId === game.awayTeam.id || f.teamId === game.homeTeam.id
        : f.kind === 'top25'
          ? game.league === 'cfb' && isRanked(game)
          : f.kind === 'conference'
            ? game.league === 'cfb' && inConference(game, f.conference)
            : f.kind === 'game'
              ? f.gameId === game.id
              : false,
  )
}
