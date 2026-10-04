/**
 * Matching Kalshi's games, teams and players to ours. Kalshi's
 * abbreviations differ from our Sources' (WAS vs WSH), so Teams match on
 * names: Kalshi's location ("Washington") or nickname (from "WAS
 * Commanders"). Pure.
 */

import type { League } from '@/lib/model/types'
import { normalizeTeamName } from '@/lib/brand/teamColors'

const LEAGUES: Record<string, League> = {
  NFL: 'nfl',
  NCAAFB: 'cfb',
  NCAAF: 'cfb',
  CFB: 'cfb',
  NBA: 'nba',
  MLB: 'mlb',
  NHL: 'nhl',
}

/** Our League for Kalshi's league name, if we cover it. */
export function leagueOf(kalshiLeague: string | undefined): League | null {
  return (kalshiLeague && LEAGUES[kalshiLeague.toUpperCase()]) || null
}

/** A Kalshi team's names as one key: "Washington|WAS Commanders". */
export function kalshiTeamKey(name?: string, teamName?: string): string {
  return [name ?? '', teamName ?? ''].join('|')
}

/**
 * Does our Team's name fit Kalshi's? Any of Kalshi's location ("Miami
 * (FL)" read as "Miami"), nickname ("WAS Commanders" read as
 * "Commanders") or mascot alone. Loose on purpose: a Game also has to
 * match on League, day and the other team.
 */
export function teamMatches(kalshiKey: string, ourName: string): boolean {
  const ours = ` ${normalizeTeamName(ourName)} `
  const [location = '', teamName = ''] = kalshiKey.split('|')
  const plain = (s: string) => s.replace(/\([^)]*\)/g, ' ')
  const words = plain(teamName).trim().split(/\s+/)
  const candidates = [
    location,
    plain(location),
    words.slice(1).join(' '),
    words.at(-1) ?? '',
  ]
  return candidates.some((n) => {
    const norm = normalizeTeamName(n)
    return norm.length >= 4 && ours.includes(` ${norm} `)
  })
}

export interface GameCandidate {
  id: string
  startsAt: string
  homeName: string
  awayName: string
}

/** The stored Game with both Kalshi teams, nearest the expected start. */
export function findGame(
  candidates: ReadonlyArray<GameCandidate>,
  kalshi: { homeKey: string; awayKey: string; startsAt: string | null },
): string | null {
  const target = kalshi.startsAt ? Date.parse(kalshi.startsAt) : NaN
  const fits = candidates.filter(
    (g) =>
      (teamMatches(kalshi.homeKey, g.homeName) &&
        teamMatches(kalshi.awayKey, g.awayName)) ||
      // Neutral sites and listing quirks: either way round.
      (teamMatches(kalshi.homeKey, g.awayName) &&
        teamMatches(kalshi.awayKey, g.homeName)),
  )
  if (fits.length === 0) return null
  if (Number.isNaN(target)) return fits[0].id
  return fits.reduce((best, g) =>
    Math.abs(Date.parse(g.startsAt) - target) <
    Math.abs(Date.parse(best.startsAt) - target)
      ? g
      : best,
  ).id
}

/** A person's name for comparison: no accents, punctuation or suffixes. */
export function normalizePlayerName(name: string): string {
  return normalizeTeamName(name)
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
