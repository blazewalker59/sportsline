/** A Prediction's teams, for its colors. Pure. */

import type { LegView } from './predictionViews'
import type { Subject } from '@/lib/brand/subject'
import type { TeamRef } from '@/lib/model/timeline'
import { pairSubject, teamSubject } from '@/lib/brand/subject'

type Leg = Pick<LegView, 'game' | 'teamId'>

/**
 * A Leg's team (the Player's, or the one picked) from its Game: null
 * without a Game, or when the team isn't in it.
 */
export function legTeam(leg: Leg): TeamRef | null {
  const g = leg.game
  if (!g || !leg.teamId) return null
  if (g.awayTeam.id === leg.teamId) return g.awayTeam
  if (g.homeTeam.id === leg.teamId) return g.homeTeam
  return null
}

/**
 * Whose a Prediction is: one team when every Leg is that team's (a
 * Player's prop, a team to win, a combo on one team); else both teams of
 * the one Game every Leg is in (a total, a combo on one Game); else none
 * (a combo across Games).
 */
export function predictionTeams(
  legs: ReadonlyArray<Leg>,
): { team: TeamRef } | { away: TeamRef; home: TeamRef } | null {
  if (legs.length === 0) return null
  const teams = legs.map(legTeam)
  const first = teams[0]
  if (first && teams.every((t) => t?.id === first.id)) return { team: first }
  const game = legs[0].game
  if (game && legs.every((l) => l.game?.id === game.id))
    return { away: game.awayTeam, home: game.homeTeam }
  return null
}

/** A Prediction's Subject: its team, or its Game's two, or none. */
export function predictionSubject(legs: ReadonlyArray<Leg>): Subject | null {
  const teams = predictionTeams(legs)
  if (!teams) return null
  return 'team' in teams
    ? teamSubject(teams.team.colors)
    : pairSubject(
        teamSubject(teams.away.colors),
        teamSubject(teams.home.colors),
      )
}
