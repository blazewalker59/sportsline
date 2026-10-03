/**
 * A Viewer's League arrangement (CONTEXT.md, "League"): the order Leagues
 * appear on the Scope row, and which are hidden (left off the row and out
 * of All). Pure.
 */

import { LEAGUES } from './types'
import type { League } from './types'

export interface LeagueSettings {
  order: Array<League>
  hidden: Array<League>
}

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  order: [...LEAGUES],
  hidden: [],
}

const isLeague = (v: unknown): v is League =>
  (LEAGUES as ReadonlyArray<unknown>).includes(v)

/**
 * Stored settings made whole: unknown Leagues dropped, duplicates removed,
 * and any League added since appended in its default place at the end.
 */
export function normalizeLeagueSettings(
  stored:
    | { order?: ReadonlyArray<unknown>; hidden?: ReadonlyArray<unknown> }
    | null
    | undefined,
): LeagueSettings {
  const order = [...new Set((stored?.order ?? []).filter(isLeague))]
  for (const league of LEAGUES) if (!order.includes(league)) order.push(league)
  const hidden = [...new Set((stored?.hidden ?? []).filter(isLeague))]
  return { order, hidden }
}

/** The Leagues to show, in the Viewer's order. */
export function visibleLeagues(settings: LeagueSettings): Array<League> {
  return settings.order.filter((l) => !settings.hidden.includes(l))
}

/** Move one League to a new position (clamped). */
export function moveLeague(
  order: ReadonlyArray<League>,
  league: League,
  to: number,
): Array<League> {
  const rest = order.filter((l) => l !== league)
  const at = Math.max(0, Math.min(rest.length, to))
  return [...rest.slice(0, at), league, ...rest.slice(at)]
}
