/**
 * A box score's stat tables by team, each named for what it counts
 * ("Passing", not "KC Passing"): what a team's tab in the box score shows.
 * Pure.
 */

import type { GameBox } from '@/lib/model/types'

export type BoxTable = GameBox['tables'][number]

/** The Game's teams, as far as naming tables goes. */
interface Teams {
  awayTeam: { abbreviation: string }
  homeTeam: { abbreviation: string }
}

export interface BoxCategory {
  /** "Passing", "Batting", "Players". */
  name: string
  table: BoxTable
}

/** A table's name without its team ("KC Passing" → "Passing"). */
export function categoryName(title: string, game: Teams): string {
  const [first, ...rest] = title.split(' ')
  const teams = [game.awayTeam.abbreviation, game.homeTeam.abbreviation].map(
    (a) => a.toUpperCase(),
  )
  return rest.length > 0 && teams.includes(first.toUpperCase())
    ? rest.join(' ')
    : title
}

/** Each team's tables in the order the box lists them. */
export function boxSides(
  box: GameBox,
  game: Teams,
): { away: Array<BoxCategory>; home: Array<BoxCategory> } {
  const side = (s: 'away' | 'home') =>
    box.tables
      .filter((t) => t.side === s)
      .map((table) => ({ name: categoryName(table.title, game), table }))
  return { away: side('away'), home: side('home') }
}
