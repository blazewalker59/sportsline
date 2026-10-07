/**
 * Team form for Sharp picks (docs/adr/0006): how each Team has played
 * lately, read from our own finals, and whether that backs a pick or
 * argues against it. The fair price still decides the edge; form decides
 * which edges are worth taking. Pure.
 */

import type { KalshiOffer } from './engine'
import type { League } from '@/lib/model/types'

/** Form covers the last week, or a Team's last few Games if that's fewer. */
export const FORM_DAYS = 7
export const FORM_MIN_GAMES = 3
/** How far back to look for those few Games (a weekly NFL schedule). */
export const FORM_LOOKBACK_DAYS = 21

export interface Final {
  homeTeamId: string
  awayTeamId: string
  homeScore: number
  awayScore: number
  startsAt: string
}

export interface TeamForm {
  games: number
  wins: number
  losses: number
  /** Points (runs, goals) scored minus allowed, a game. */
  avgMargin: number
  /** Both teams' points together, a game. */
  avgTotal: number
}

/** Each Team's form from its recent finals. */
export function teamForms(
  finals: ReadonlyArray<Final>,
  now: number,
): Map<string, TeamForm> {
  const byTeam = new Map<
    string,
    Array<{ at: number; for: number; against: number }>
  >()
  const add = (team: string, at: number, scored: number, allowed: number) =>
    byTeam.set(team, [
      ...(byTeam.get(team) ?? []),
      { at, for: scored, against: allowed },
    ])
  for (const f of finals) {
    const at = Date.parse(f.startsAt)
    if (!(at < now) || now - at > FORM_LOOKBACK_DAYS * 86_400_000) continue
    add(f.homeTeamId, at, f.homeScore, f.awayScore)
    add(f.awayTeamId, at, f.awayScore, f.homeScore)
  }
  const out = new Map<string, TeamForm>()
  for (const [team, all] of byTeam) {
    const latest = [...all].sort((a, b) => b.at - a.at)
    const week = latest.filter((g) => now - g.at <= FORM_DAYS * 86_400_000)
    const games =
      week.length >= FORM_MIN_GAMES ? week : latest.slice(0, FORM_MIN_GAMES)
    out.set(team, {
      games: games.length,
      wins: games.filter((g) => g.for > g.against).length,
      losses: games.filter((g) => g.for < g.against).length,
      avgMargin:
        games.reduce((n, g) => n + g.for - g.against, 0) / games.length,
      avgTotal: games.reduce((n, g) => n + g.for + g.against, 0) / games.length,
    })
  }
  return out
}

/** A typical game-to-game swing, per League: what one unit of lean means. */
const MARGIN_SCALE: Record<League, number> = {
  nfl: 13,
  nba: 12,
  mlb: 3.5,
  nhl: 2.2,
  cfb: 16,
}
const TOTAL_SCALE: Record<League, number> = {
  nfl: 10,
  nba: 15,
  mlb: 3,
  nhl: 1.6,
  cfb: 12,
}
const UNIT: Record<League, string> = {
  nfl: 'pts',
  nba: 'pts',
  mlb: 'runs',
  nhl: 'goals',
  cfb: 'pts',
}

/** Too few Games to call it form. */
const MIN_GAMES = 2

export interface PickForm {
  /** −1 (form says the other way) to 1 (form backs the pick). */
  lean: number
  /** "PHI 4-1, +6.2 a game · NYK 1-3, −3.5 (recent form)". */
  note: string
}

export interface FormGame {
  league: League
  home: { id: string; abbreviation: string }
  away: { id: string; abbreviation: string }
}

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`
const clamp = (n: number) => Math.max(-1, Math.min(1, n))

/** What the two Teams' form says about one side of one market. */
export function formOf(
  offer: Pick<KalshiOffer, 'key' | 'side'>,
  game: FormGame,
  forms: ReadonlyMap<string, TeamForm>,
): PickForm | null {
  const home = forms.get(game.home.id)
  const away = forms.get(game.away.id)
  if (!home || !away || home.games < MIN_GAMES || away.games < MIN_GAMES)
    return null
  const flip = offer.side === 'yes' ? 1 : -1
  const unit = UNIT[game.league]
  if (offer.key.kind === 'total') {
    // Both Teams' recent games, against the line.
    const recent = (home.avgTotal + away.avgTotal) / 2
    const line = offer.key.line ?? recent
    return {
      lean: clamp(((recent - line) / TOTAL_SCALE[game.league]) * flip),
      note: `Recent games average ${recent.toFixed(1)} ${unit} (line ${line})`,
    }
  }
  // Moneyline and spread: the backed Team's margin against the other's.
  const [team, other] =
    offer.key.teamId === game.away.id
      ? [
          { ...game.away, f: away },
          { ...game.home, f: home },
        ]
      : [
          { ...game.home, f: home },
          { ...game.away, f: away },
        ]
  const describe = (t: typeof team) =>
    `${t.abbreviation} ${t.f.wins}-${t.f.losses}, ${signed(t.f.avgMargin)} a game`
  return {
    lean: clamp(
      ((team.f.avgMargin - other.f.avgMargin) / MARGIN_SCALE[game.league]) *
        flip,
    ),
    note: `${describe(team)} · ${describe(other)} (${unit}, recent form)`,
  }
}
