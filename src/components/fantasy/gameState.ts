/**
 * A Lineup Player's Game, from the Games we have: when it is, and in
 * football whether their unit is on the field. Pure.
 */

import type { LineupPlayer } from '@/lib/fantasy/matchup'
import type { GameSummary } from '@/lib/model/timeline'

export interface GameState {
  game: GameSummary
  home: boolean
  /** "Sun 4:25 PM", "Q2 0:03", "Final". */
  status: string
  live: boolean
  upcoming: boolean
  onField: boolean
  redZone: boolean
}

/**
 * A Player's Game from the Games we have: its state, and in football
 * whether their unit is on the field (their team has the ball, or for a
 * defense, doesn't) and in the red zone (inside the 20).
 */
export function gameState(
  p: LineupPlayer,
  games: ReadonlyArray<GameSummary>,
): GameState | null {
  if (!p.teamId) return null
  const g = games.find(
    (x) => x.awayTeam.id === p.teamId || x.homeTeam.id === p.teamId,
  )
  if (!g) return null
  const home = g.homeTeam.id === p.teamId
  const live = g.status === 'live' || g.status === 'delayed'
  const upcoming = !live && g.status !== 'final'
  const status = live
    ? (g.situation?.segmentLabel ?? 'Live')
    : g.status === 'final'
      ? 'Final'
      : new Date(g.startsAt).toLocaleString([], {
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })
  const base = { game: g, home, status, live, upcoming }
  const detail = (g.situation?.detail ?? {}) as {
    possession?: string | null
    downDistance?: string | null
  }
  if (!live || g.league !== 'nfl' || !detail.possession)
    return { ...base, onField: false, redZone: false }
  const ours = home ? g.homeTeam.abbreviation : g.awayTeam.abbreviation
  const hasBall = detail.possession === (p.teamAbbrev ?? ours)
  const defense = p.positionId === 16
  const spot = /at ([A-Z]{2,4}) (\d{1,2})/.exec(detail.downDistance ?? '')
  // Inside the 20 on the defending team's side.
  const redZone =
    spot !== null && spot[1] !== detail.possession && Number(spot[2]) <= 20
  const onField = defense ? !hasBall : hasBall
  return { ...base, onField, redZone: onField && redZone }
}
