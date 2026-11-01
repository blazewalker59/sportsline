/** A Leg's team, for its colors. Pure. */

import type { LegView } from './predictionViews'
import type { TeamRef } from '@/lib/model/timeline'

/**
 * A Leg's team (the Player's, or the one picked) from its Game: null
 * without a Game, or when the team isn't in it.
 */
export function legTeam(leg: Pick<LegView, 'game' | 'teamId'>): TeamRef | null {
  const g = leg.game
  if (!g || !leg.teamId) return null
  if (g.awayTeam.id === leg.teamId) return g.awayTeam
  if (g.homeTeam.id === leg.teamId) return g.homeTeam
  return null
}
