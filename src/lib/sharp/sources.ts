/**
 * Fair-price sources for Sharp picks (docs/adr/0006), each read into
 * Quotes on our Games: The Odds API (Pinnacle, Novig, Polymarket,
 * BetOnline and DraftKings in one call a sport) when a key is set, and
 * Polymarket's own public API. Server only.
 */

import { aliasedTable, and, eq, gte, inArray, lte } from 'drizzle-orm'
import { devig, impliedFromAmerican } from './engine'
import type { FairSource, LineKey, Quote } from './engine'
import type { Final } from './form'
import type { Database } from '@/lib/db'
import type { League } from '@/lib/model/types'
import { games, teams } from '@/lib/db/schema'
import { findGame, teamMatches } from '@/lib/kalshi/match'
import { fetchWithRetry } from '@/lib/sources/pool'

/** The Leagues Sharp picks cover: the four major American sports. */
export const SHARP_LEAGUES: ReadonlyArray<League> = ['nfl', 'nba', 'mlb', 'nhl']
/**
 * The Leagues trend picks cover: college football too, whose fair price
 * needs only Kalshi and our own finals, not the sharp books.
 */
export const TREND_LEAGUES: ReadonlyArray<League> = [...SHARP_LEAGUES, 'cfb']

export interface GameRef {
  gameId: string
  league: League
  startsAt: string
  status: string
  home: { id: string; name: string; abbreviation: string }
  away: { id: string; name: string; abbreviation: string }
}

/** Our Games in the window, with their Teams, for matching sources to. */
export async function loadGames(
  db: Database,
  fromDay: string,
  toDay: string,
  leagues: ReadonlyArray<League> = SHARP_LEAGUES,
): Promise<Array<GameRef>> {
  const home = aliasedTable(teams, 'home')
  const away = aliasedTable(teams, 'away')
  const rows = await db
    .select({ game: games, home, away })
    .from(games)
    .innerJoin(home, eq(home.id, games.homeTeamId))
    .innerJoin(away, eq(away.id, games.awayTeamId))
    .where(
      and(
        inArray(games.league, [...leagues]),
        gte(games.sportsDay, fromDay),
        lte(games.sportsDay, toDay),
      ),
    )
  return rows.map((r) => ({
    gameId: r.game.id,
    league: r.game.league,
    startsAt: r.game.startsAt,
    status: r.game.status,
    home: r.home,
    away: r.away,
  }))
}

/** Our Game for a source's two team names and start time. */
export function matchGame(
  refs: ReadonlyArray<GameRef>,
  league: League,
  homeName: string,
  awayName: string,
  startsAt: string | null,
): GameRef | null {
  const pool = refs.filter((g) => g.league === league)
  const id = findGame(
    pool.map((g) => ({
      id: g.gameId,
      startsAt: g.startsAt,
      homeName: g.home.name,
      awayName: g.away.name,
    })),
    { homeKey: `${homeName}|`, awayKey: `${awayName}|`, startsAt },
  )
  return pool.find((g) => g.gameId === id) ?? null
}

/** Which of the Game's Teams a source's team name means. */
export function teamOf(game: GameRef, name: string): string | null {
  if (teamMatches(`${name}|`, game.home.name)) return game.home.id
  if (teamMatches(`${name}|`, game.away.name)) return game.away.id
  return null
}

// ─── The Odds API ───────────────────────────────────────────────────────────

const ODDS_SPORTS: Record<string, League> = {
  americanfootball_nfl: 'nfl',
  basketball_nba: 'nba',
  baseball_mlb: 'mlb',
  icehockey_nhl: 'nhl',
}

/** Bookmakers read (one call covers up to ten, for one credit a market). */
const BOOKS: Record<string, FairSource> = {
  pinnacle: 'pinnacle',
  novig: 'novig',
  polymarket: 'polymarket',
  betonlineag: 'betonline',
  draftkings: 'draftkings',
}

interface OddsEvent {
  home_team: string
  away_team: string
  commence_time: string
  bookmakers?: Array<{
    key: string
    markets?: Array<{
      key: string
      outcomes?: Array<{ name: string; price: number; point?: number }>
    }>
  }>
}

/** Quotes from The Odds API; also the credits it reports left. */
export async function oddsApiQuotes(
  apiKey: string,
  refs: ReadonlyArray<GameRef>,
): Promise<{ quotes: Array<Quote>; remaining: number | null }> {
  const quotes: Array<Quote> = []
  let remaining: number | null = null
  for (const [sport, league] of Object.entries(ODDS_SPORTS)) {
    if (!refs.some((g) => g.league === league)) continue
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds?apiKey=${encodeURIComponent(apiKey)}&bookmakers=${Object.keys(BOOKS).join(',')}&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`
    const res = await fetchWithRetry(url, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Odds API ${res.status} for ${sport}`)
    remaining = Number(res.headers.get('x-requests-remaining') ?? NaN)
    for (const e of (await res.json()) as Array<OddsEvent>) {
      const game = matchGame(
        refs,
        league,
        e.home_team,
        e.away_team,
        e.commence_time,
      )
      if (!game) continue
      for (const b of e.bookmakers ?? []) {
        const source = BOOKS[b.key]
        if (!source) continue
        for (const m of b.markets ?? []) {
          quotes.push(
            ...oddsMarketQuotes(game, source, m.key, m.outcomes ?? []),
          )
        }
      }
    }
  }
  return { quotes, remaining: Number.isNaN(remaining) ? null : remaining }
}

/** One bookmaker's market, de-vigged, as Quotes on canonical Lines. */
export function oddsMarketQuotes(
  game: GameRef,
  source: FairSource,
  market: string,
  outcomes: ReadonlyArray<{ name: string; price: number; point?: number }>,
): Array<Quote> {
  if (outcomes.length !== 2) return []
  const [a, b] = outcomes
  const [pa, pb] = devig(
    impliedFromAmerican(a.price),
    impliedFromAmerican(b.price),
  )
  const quote = (key: Omit<LineKey, 'gameId'>, prob: number): Quote => ({
    key: { gameId: game.gameId, ...key },
    source,
    prob,
  })
  if (market === 'h2h') {
    const ta = teamOf(game, a.name)
    const tb = teamOf(game, b.name)
    if (!ta || !tb || ta === tb) return []
    return [
      quote({ kind: 'moneyline', teamId: ta, line: null }, pa),
      quote({ kind: 'moneyline', teamId: tb, line: null }, pb),
    ]
  }
  if (market === 'spreads') {
    // The favorite (negative point) "wins by more than" the margin.
    const fav =
      (a.point ?? 0) < 0
        ? { o: a, p: pa }
        : (b.point ?? 0) < 0
          ? { o: b, p: pb }
          : null
    if (!fav) return []
    const team = teamOf(game, fav.o.name)
    if (!team) return []
    return [
      quote({ kind: 'spread', teamId: team, line: -(fav.o.point ?? 0) }, fav.p),
    ]
  }
  if (market === 'totals') {
    const over = /^over$/i.test(a.name)
      ? { o: a, p: pa }
      : /^over$/i.test(b.name)
        ? { o: b, p: pb }
        : null
    if (!over || over.o.point === undefined) return []
    return [quote({ kind: 'total', teamId: null, line: over.o.point }, over.p)]
  }
  return []
}

// ─── Polymarket ─────────────────────────────────────────────────────────────

/** Polymarket's series for each League (gamma-api /sports). */
const POLY_SERIES: Record<League, string | undefined> = {
  nfl: '12185',
  nba: '10345',
  mlb: '3',
  nhl: '10346',
  cfb: undefined,
}

/** A Polymarket book wider than this isn't a price worth reading. */
const POLY_MAX_SPREAD = 0.06

interface PolyEvent {
  title?: string
  startTime?: string
  closed?: boolean
  markets?: Array<{
    sportsMarketType?: string
    line?: number | null
    outcomes?: string
    bestBid?: number
    bestAsk?: number
    closed?: boolean
    acceptingOrders?: boolean
  }>
}

/** Quotes from Polymarket's game markets (free, no key). */
export async function polymarketQuotes(
  refs: ReadonlyArray<GameRef>,
): Promise<Array<Quote>> {
  const quotes: Array<Quote> = []
  const starts = refs.map((g) => Date.parse(g.startsAt))
  const from = Math.min(...starts) - 6 * 3_600_000
  const to = Math.max(...starts) + 6 * 3_600_000
  for (const league of SHARP_LEAGUES) {
    const series = POLY_SERIES[league]
    if (!series || !refs.some((g) => g.league === league)) continue
    const res = await fetchWithRetry(
      `https://gamma-api.polymarket.com/events?series_id=${series}&active=true&closed=false&limit=500`,
      { headers: { accept: 'application/json' } },
    )
    if (!res.ok) throw new Error(`Polymarket ${res.status} for ${league}`)
    for (const e of (await res.json()) as Array<PolyEvent>) {
      const at = Date.parse(e.startTime ?? '')
      if (!(at >= from && at <= to)) continue
      // "Away vs. Home" (Polymarket lists the away team first).
      const [away, home] = (e.title ?? '').split(/\s+vs\.?\s+/i)
      if (!away || !home) continue
      const game = matchGame(
        refs,
        league,
        home.trim(),
        away.trim(),
        e.startTime ?? null,
      )
      if (!game) continue
      for (const m of e.markets ?? []) quotes.push(...polyMarketQuotes(game, m))
    }
  }
  return quotes
}

export function polyMarketQuotes(
  game: GameRef,
  m: NonNullable<PolyEvent['markets']>[number],
): Array<Quote> {
  if (m.closed || m.acceptingOrders === false) return []
  const bid = m.bestBid
  const ask = m.bestAsk
  if (
    bid === undefined ||
    ask === undefined ||
    !(ask > 0) ||
    ask - bid > POLY_MAX_SPREAD
  )
    return []
  const prob = (bid + ask) / 2
  let names: Array<string> = []
  try {
    names = JSON.parse(m.outcomes ?? '[]') as Array<string>
  } catch {
    return []
  }
  const quote = (key: Omit<LineKey, 'gameId'>, p: number): Quote => ({
    key: { gameId: game.gameId, ...key },
    source: 'polymarket',
    prob: p,
  })
  if (m.sportsMarketType === 'moneyline' && names.length === 2) {
    const ta = teamOf(game, names[0])
    const tb = teamOf(game, names[1])
    if (!ta || !tb || ta === tb) return []
    return [
      quote({ kind: 'moneyline', teamId: ta, line: null }, prob),
      quote({ kind: 'moneyline', teamId: tb, line: null }, 1 - prob),
    ]
  }
  if (m.sportsMarketType === 'spreads' && m.line != null && m.line < 0) {
    // "Spread: Saints (−1.5)": the first outcome wins by more than 1.5.
    const team = teamOf(game, names[0] ?? '')
    if (!team) return []
    return [quote({ kind: 'spread', teamId: team, line: -m.line }, prob)]
  }
  if (
    m.sportsMarketType === 'totals' &&
    m.line != null &&
    /^over$/i.test(names[0] ?? '')
  ) {
    return [quote({ kind: 'total', teamId: null, line: m.line }, prob)]
  }
  return []
}

// ─── Form ───────────────────────────────────────────────────────────────────

/** The Teams' finals over the days given, for their recent form. */
export async function loadFinals(
  db: Database,
  teamIds: ReadonlyArray<string>,
  fromDay: string,
  toDay: string,
  leagues: ReadonlyArray<League> = SHARP_LEAGUES,
): Promise<Array<Final>> {
  if (teamIds.length === 0) return []
  const rows = await db
    .select({
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      startsAt: games.startsAt,
    })
    .from(games)
    .where(
      and(
        inArray(games.league, [...leagues]),
        eq(games.status, 'final'),
        gte(games.sportsDay, fromDay),
        lte(games.sportsDay, toDay),
      ),
    )
  const wanted = new Set(teamIds)
  return rows.filter(
    (r) => wanted.has(r.homeTeamId) || wanted.has(r.awayTeamId),
  )
}
