/**
 * Finding the Games an ask is about ("the Avs game", "NBA tonight", "the
 * college noon slate"): a Team by its city, nickname, abbreviation or fans'
 * shorthand, a League by name or sport, and a Slate by kickoff time. Pure.
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
  bama: 'alabama',
  noles: 'seminoles',
  horns: 'longhorns',
}

const LEAGUE_WORDS: Record<string, League> = {
  cfb: 'cfb',
  ncaaf: 'cfb',
  ncaa: 'cfb',
  college: 'cfb',
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

/** The League an ask names ("NBA", "hockey", "college football"), if any. */
export function leagueFrom(text: string): League | null {
  const named = words(text)
    .split(' ')
    .flatMap((w) => (LEAGUE_WORDS[w] ? [LEAGUE_WORDS[w]] : []))
  // "College football": college decides it, not football.
  return named.includes('cfb') ? 'cfb' : (named[0] ?? null)
}

/**
 * A day's Games by kickoff, Eastern: early (before 11am), noon (to 2:30pm,
 * college football's noon window), afternoon (to 6pm, its 3:30 window),
 * evening (to 9:30pm, prime time) and late (10:30pm kickoffs, West Coast).
 */
export const SLATES = ['early', 'noon', 'afternoon', 'evening', 'late'] as const
export type Slate = (typeof SLATES)[number]

/** Where each Slate ends, in minutes past midnight Eastern. */
const SLATE_ENDS: Array<[Slate, number]> = [
  ['early', 11 * 60],
  ['noon', 14 * 60 + 30],
  ['afternoon', 18 * 60],
  ['evening', 21 * 60 + 30],
]

const easternClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** The Slate a Game kicking off then is in. */
export function slateOf(startsAt: string): Slate {
  const parts = easternClock.formatToParts(new Date(startsAt))
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  const minutes = part('hour') * 60 + part('minute')
  // Past midnight is still the night before's late window.
  if (minutes < 6 * 60) return 'late'
  return SLATE_ENDS.find(([, end]) => minutes < end)?.[0] ?? 'late'
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

/** The Games an ask could mean, by Team, League and Slate. */
export function gamesFor(
  games: ReadonlyArray<GameRef>,
  ask: { team?: string; league?: League | null; slate?: Slate },
): Array<GameRef> {
  return games.filter(
    (g) =>
      (!ask.league || g.league === ask.league) &&
      (!ask.slate || slateOf(g.startsAt) === ask.slate) &&
      (!ask.team ||
        teamMatches(g.home, ask.team) ||
        teamMatches(g.away, ask.team)),
  )
}
