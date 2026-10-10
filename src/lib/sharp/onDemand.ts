/**
 * Trend picks on demand (docs/adr/0009): the best-value Kalshi offers on
 * the Games an ask is about, priced against our own trends rather than the
 * sharp books, so an ask costs no Odds API credits. Server only.
 */

import {
  DEFAULT_RULES,
  candidates,
  lineId,
  scoreOf,
  selectCombo,
  selectPicks,
} from './engine'
import { FORM_LOOKBACK_DAYS, formOf, teamForms } from './form'
import { kalshiOffers, serviceAccount } from './kalshi'
import { gamesFor } from './lookup'
import { TREND_LEAGUES, loadFinals, loadGames } from './sources'
import { leagueTotals, trendFair } from './trends'
import type { Candidate, ComboPick } from './engine'
import type { Slate } from './lookup'
import type { GameRef } from './sources'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { League } from '@/lib/model/types'
import { loadAccount } from '@/lib/kalshi/account'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'

export interface BetAsk {
  team?: string
  league?: League | null
  /** Today, tomorrow, or (unset) the next day with a matching Game. */
  day?: 'today' | 'tomorrow'
  /** Only Games kicking off in this window ("the noon slate"). */
  slate?: Slate
  count: number
  /** A combo of this many legs, from different Games, instead of singles. */
  legs?: number
  /** Pick at random among the offers our trends favor, not the very best. */
  surprise?: boolean
}

export interface TrendPick extends Candidate {
  /** Our trends' own chance of the pick, before blending with Kalshi. */
  trendChance: number
}

export interface TrendCombo extends Omit<ComboPick, 'legs'> {
  legs: Array<TrendPick>
}

export interface BetAnswer {
  /** The Games the ask matched, soonest first. */
  games: Array<GameRef>
  /** The singles, or a combo's legs. */
  picks: Array<TrendPick>
  /** The combo, when legs were asked for and enough Games had one. */
  combo: TrendCombo | null
  /** Why there's nothing to show, when there isn't. */
  reason: string | null
}

const LEAGUE_NAMES: Record<League, string> = {
  nfl: 'NFL',
  nba: 'NBA',
  mlb: 'MLB',
  nhl: 'NHL',
  cfb: 'college football',
}

/** Show nothing priced this far against us, even as a least-bad pick. */
const MIN_TREND_EDGE = -0.05

export async function findBets(
  env: CloudflareEnv,
  db: Database,
  viewerId: string,
  ask: BetAsk,
  now = new Date(),
  random: () => number = Math.random,
): Promise<BetAnswer> {
  const today = sportsDayOf(now)
  const tomorrow = shiftSportsDay(today, 1)
  const leadMs = DEFAULT_RULES.minLeadMs
  const upcoming = (await loadGames(db, today, tomorrow, TREND_LEAGUES)).filter(
    (g) =>
      g.status === 'scheduled' &&
      Date.parse(g.startsAt) - now.getTime() >= leadMs,
  )
  const matched = gamesFor(upcoming, ask).sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  )
  const day =
    ask.day === 'today'
      ? today
      : ask.day === 'tomorrow'
        ? tomorrow
        : // "The Avs game": their next one.
          matched.length
          ? sportsDayOf(new Date(matched[0].startsAt))
          : today
  const games = matched.filter((g) => sportsDayOf(new Date(g.startsAt)) === day)
  const none = (reason: string): BetAnswer => ({
    games,
    picks: [],
    combo: null,
    reason,
  })
  const slate = ask.slate ? ` in the ${ask.slate} slate` : ''
  if (games.length === 0) {
    return none(
      ask.team
        ? `No upcoming game for “${ask.team}”${slate}${ask.day ? ` ${ask.day}` : ' today or tomorrow'} that hasn’t started.`
        : `No ${ask.league ? LEAGUE_NAMES[ask.league] : ''} games${slate} ${ask.day ?? 'today'} that haven’t started.`,
    )
  }
  if (ask.legs && games.length < 2) {
    return none(
      `Only one game${slate} ${ask.day ?? 'today'} that hasn’t started: a combo needs legs from different games.`,
    )
  }

  const account =
    (await loadAccount(env, viewerId)) ?? (await serviceAccount(env, db))
  const offers = await kalshiOffers(env, account, db, games, new Set([day]))
  if (offers.length === 0) return none('Kalshi has no open markets on it yet.')

  const leagueOf = new Map(
    games.flatMap((g) => [
      [g.home.id, g.league],
      [g.away.id, g.league],
    ]),
  )
  const finals = await loadFinals(
    db,
    [...leagueOf.keys()],
    shiftSportsDay(day, -FORM_LOOKBACK_DAYS),
    shiftSportsDay(day, -1),
    TREND_LEAGUES,
  )
  const forms = teamForms(finals, now.getTime())
  const { fair, model } = trendFair(
    offers,
    new Map(games.map((g) => [g.gameId, g])),
    forms,
    leagueTotals(
      finals.flatMap((f) => {
        const league = leagueOf.get(f.homeTeamId) ?? leagueOf.get(f.awayTeamId)
        return league ? [{ league, total: f.homeScore + f.awayScore }] : []
      }),
    ),
  )
  if (fair.size === 0) {
    return none(
      'Not enough recent games stored for these teams to read a trend (at least 3 each).',
    )
  }

  const gameOf = new Map(games.map((g) => [g.gameId, g]))
  const pool = candidates(
    offers,
    fair,
    {
      ...DEFAULT_RULES,
      minEdge: MIN_TREND_EDGE,
      requireSharp: false,
      now: now.getTime(),
    },
    (o) => {
      const game = gameOf.get(o.key.gameId)
      return game ? formOf(o, game, forms) : null
    },
  )
  const withTrend = (c: Candidate): TrendPick => {
    const p = model.get(lineId(c.key)) ?? c.fair
    return { ...c, trendChance: c.side === 'yes' ? p : 1 - p }
  }
  if (pool.length === 0) {
    return none(
      'Nothing on Kalshi is priced fairly enough to suggest (prices 20–80¢, tight spreads, main lines).',
    )
  }

  const bets = distinctBets(pool, gameOf)
  if (ask.legs) {
    const combo = selectCombo(bets, ask.legs)
    if (!combo) {
      return none(
        'Too few games have a leg our trends rate as likely (45%+) for a combo.',
      )
    }
    const legs = combo.legs.map(withTrend)
    return {
      games,
      picks: legs,
      combo: { ...combo, legs },
      reason:
        legs.length < ask.legs
          ? `Only ${legs.length} games had a leg worth adding, so this is a ${legs.length}-leg combo.`
          : null,
    }
  }
  let picks: Array<Candidate>
  if (ask.surprise) {
    // Any offer our trends favor; failing that, the best there is.
    const favored = bets.filter((c) => c.edge > 0)
    const from = favored.length ? favored : bets
    picks = [from[Math.floor(random() * from.length)]]
  } else if (games.length === 1) {
    // One Game: its best markets, most valuable first.
    picks = [...bets]
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, ask.count)
  } else {
    picks = selectPicks(bets, ask.count)
  }
  return { games, picks: picks.map(withTrend), combo: null, reason: null }
}

/**
 * One way to make each bet, the best-valued: "COL win" and "ANA lose" are
 * the same bet on a winner market, as are both sides of one spread or total
 * line at heart. Pure.
 */
export function distinctBets(
  pool: ReadonlyArray<Candidate>,
  games: ReadonlyMap<string, GameRef>,
): Array<Candidate> {
  const best = new Map<string, Candidate>()
  for (const c of pool) {
    const game = games.get(c.key.gameId)
    let id = lineId(c.key)
    if (c.key.kind === 'moneyline' && game) {
      const other = c.key.teamId === game.home.id ? game.away.id : game.home.id
      const backed = c.side === 'yes' ? c.key.teamId : other
      id = `${c.key.gameId}|moneyline|${backed}`
    }
    const was = best.get(id)
    if (!was || scoreOf(c) > scoreOf(was)) best.set(id, c)
  }
  return [...best.values()]
}
