/**
 * How a Viewer arranges the League row (CONTEXT.md, "League"): the order of
 * the Leagues, and which are hidden. A hidden League is also left out of
 * All. Pure.
 */

import { LEAGUES } from './types'
import type { League } from './types'

/**
 * College football's major conferences: a Game records each team's, to
 * show beside it. Not a Scope or a Follow (college is opt-in by Game).
 */
const CONFERENCES = ['sec', 'big10', 'big12', 'acc'] as const
export type Conference = (typeof CONFERENCES)[number]

/** Anything with a place on the League row: the Leagues. */
export type RowItem = League

/** The default row: every League, in the app's order. */
export const ROW_ITEMS: ReadonlyArray<RowItem> = [...LEAGUES]

export interface LeagueSettings {
  order: Array<RowItem>
  hidden: Array<RowItem>
}

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  order: [...ROW_ITEMS],
  hidden: [],
}

export const isLeague = (v: unknown): v is League =>
  (LEAGUES as ReadonlyArray<unknown>).includes(v)
export const isConference = (v: unknown): v is Conference =>
  (CONFERENCES as ReadonlyArray<unknown>).includes(v)
export const isRowItem = (v: unknown): v is RowItem =>
  (ROW_ITEMS as ReadonlyArray<unknown>).includes(v)

/**
 * Stored settings made whole: unknown items dropped, duplicates removed,
 * and anything added since placed after its neighbour in the default row
 * (so a new League lands beside the one before it).
 */
export function normalizeLeagueSettings(
  stored:
    | { order?: ReadonlyArray<unknown>; hidden?: ReadonlyArray<unknown> }
    | null
    | undefined,
): LeagueSettings {
  const order = [...new Set((stored?.order ?? []).filter(isRowItem))]
  ROW_ITEMS.forEach((item, i) => {
    if (order.includes(item)) return
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const k = order.indexOf(ROW_ITEMS[j])
      if (k >= 0) {
        at = k + 1
        break
      }
    }
    order.splice(at, 0, item)
  })
  const hidden = [...new Set((stored?.hidden ?? []).filter(isRowItem))]
  return { order, hidden }
}

/** The row's items to show, in the Viewer's order. */
export function visibleRowItems(settings: LeagueSettings): Array<RowItem> {
  return settings.order.filter((x) => !settings.hidden.includes(x))
}

/** The Leagues All covers: the visible ones. */
export function visibleLeagues(settings: LeagueSettings): Array<League> {
  return visibleRowItems(settings).filter(isLeague)
}

/** Move one item to a new position (clamped). */
export function moveLeague<T extends RowItem>(
  order: ReadonlyArray<T>,
  item: T,
  to: number,
): Array<T> {
  const rest = order.filter((l) => l !== item)
  const at = Math.max(0, Math.min(rest.length, to))
  return [...rest.slice(0, at), item, ...rest.slice(at)]
}
