/**
 * Finding the Games an ask is about ("the Avs game", "NBA tonight"): a Team
 * by its city, nickname, abbreviation or fans' shorthand, and a League by
 * name or sport. Pure.
 */

import type { GameRef } from './sources'
import type { League } from '@/lib/model/types'

/** Fans' shorthand for nicknames, mapped to a word in the full name. */
const SHORTHAND: Record<string, string> = {
  avs: 'avalanche',
  habs: 'canadiens',
  caps: 'capitals',
  sens: 'senators',
  pens: 'penguins',
  canes: 'hurricanes',
  bolts: 'lightning',
  jackets: 'blue jackets',
  cbj: 'blue jackets',
  isles: 'islanders',
  preds: 'predators',
  nucks: 'canucks',
  leafs: 'maple leafs',
  cavs: 'cavaliers',
  mavs: 'mavericks',
  sixers: '76ers',
  wolves: 'timberwolves',
  pels: 'pelicans',
  blazers: 'trail blazers',
  dubs: 'warriors',
  niners: '49ers',
  pats: 'patriots',
  bucs: 'buccaneers',
  jags: 'jaguars',
  phins: 'dolphins',
  barves: 'braves',
  'd-backs': 'diamondbacks',
  dbacks: 'diamondbacks',
  yanks: 'yankees',
  cards: 'cardinals',
  as: 'athletics',
}

const LEAGUE_WORDS: Record<string, League> = {
  nfl: 'nfl',
  football: 'nfl',
  nba: 'nba',
  basketball: 'nba',
  hoops: 'nba',
  mlb: 'mlb',
  baseball: 'mlb',
  nhl: 'nhl',
  hockey: 'nhl',
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9& -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** The League an ask names ("NBA", "hockey"), if any. */
export function leagueFrom(text: string): League | null {
  for (const w of words(text).split(' '))
    if (LEAGUE_WORDS[w]) return LEAGUE_WORDS[w]
  return null
}

/** Does this Team answer to the name asked for? */
export function teamMatches(team: GameRef['home'], asked: string): boolean {
  const q = words(asked).replace(/^the /, '')
  if (!q) return false
  const name = ` ${words(team.name)} `
  if (q === team.abbreviation.toLowerCase()) return true
  const wanted = SHORTHAND[q] ?? q
  // Whole words of the name: "avalanche", "colorado", "maple leafs".
  return wanted.length >= 3 && name.includes(` ${wanted} `)
}

/** The Games an ask could mean, by Team and League. */
export function gamesFor(
  games: ReadonlyArray<GameRef>,
  ask: { team?: string; league?: League | null },
): Array<GameRef> {
  return games.filter(
    (g) =>
      (!ask.league || g.league === ask.league) &&
      (!ask.team ||
        teamMatches(g.home, ask.team) ||
        teamMatches(g.away, ask.team)),
  )
}
