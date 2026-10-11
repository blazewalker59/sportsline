/**
 * The day's Kalshi game markets for Sharp picks, as offers on our Lines
 * (docs/adr/0006): winners, spreads (a ladder of "wins by over") and
 * totals for the four Leagues and college football. Read with a service
 * account, because Kalshi only answers signed requests from Cloudflare
 * (docs/adr/0003).
 * Server only.
 */

import { and, eq, inArray } from 'drizzle-orm'
import { teamOf } from './sources'
import type { KalshiOffer, MarketKind } from './engine'
import type { GameRef } from './sources'
import type { KalshiAccount, KalshiMarket } from '@/lib/kalshi/client'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { League } from '@/lib/model/types'
import { kalshiAccounts, user } from '@/lib/db/schema'
import { loadAccount } from '@/lib/kalshi/account'
import { KALSHI_HOST, signedGet } from '@/lib/kalshi/client'
import { dollars } from '@/lib/kalshi/markets'
import { gameFor } from '@/lib/kalshi/matching'
import { adminEmails } from '@/lib/ops/errors'

/** Each League's name in Kalshi's series tickers. */
const KALSHI_LEAGUE: Array<[string, League]> = [
  ['NFL', 'nfl'],
  ['NBA', 'nba'],
  ['MLB', 'mlb'],
  ['NHL', 'nhl'],
  ['NCAAF', 'cfb'],
]

const SERIES: Array<{ series: string; league: League; kind: MarketKind }> =
  KALSHI_LEAGUE.flatMap(([l, league]) => [
    { series: `KX${l}GAME`, league, kind: 'moneyline' as const },
    { series: `KX${l}SPREAD`, league, kind: 'spread' as const },
    { series: `KX${l}TOTAL`, league, kind: 'total' as const },
  ])

const MONTHS = 'JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC'

/** "KXNBASPREAD-26OCT05NYKPHI" → its date ("2026-10-05") and teams ("NYKPHI"). */
function parseEventTicker(
  eventTicker: string,
): { day: string; teams: string } | null {
  const m = /-(\d{2})([A-Z]{3})(\d{2})(?:\d{4})?([A-Z]+)$/.exec(eventTicker)
  if (!m) return null
  const month = MONTHS.indexOf(m[2]) / 3 + 1
  if (month < 1) return null
  return {
    day: `20${m[1]}-${String(month).padStart(2, '0')}-${m[3]}`,
    teams: m[4],
  }
}

/** A Kalshi account to read markets with: an admin's connected key. */
export async function serviceAccount(
  env: CloudflareEnv,
  db: Database,
): Promise<KalshiAccount | null> {
  const emails = adminEmails(env)
  if (emails.length === 0) return null
  const row = await db
    .select({ viewerId: kalshiAccounts.viewerId })
    .from(kalshiAccounts)
    .innerJoin(user, eq(user.id, kalshiAccounts.viewerId))
    .where(and(inArray(user.email, emails), eq(kalshiAccounts.status, 'ok')))
    .get()
  return row ? loadAccount(env, row.viewerId) : null
}

async function openMarkets(
  account: KalshiAccount | null,
  series: string,
): Promise<Array<KalshiMarket & { volume_fp?: string; event_ticker: string }>> {
  const out: Array<KalshiMarket & { volume_fp?: string }> = []
  let cursor = ''
  for (let page = 0; page < 5; page++) {
    const path = `/markets?series_ticker=${series}&status=open&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    type Page = { markets?: Array<KalshiMarket>; cursor?: string }
    // Unsigned works off Cloudflare (local tests); Workers must sign.
    const r: Page = account
      ? await signedGet<Page>(account, path)
      : ((await (
          await fetch(`${KALSHI_HOST}/trade-api/v2${path}`)
        ).json()) as Page)
    out.push(...(r.markets ?? []))
    cursor = r.cursor ?? ''
    if (!cursor) break
  }
  return out
}

/** Kalshi's own title for each Game, by its event's date and teams. */
async function gameTitles(
  account: KalshiAccount | null,
  series: string,
): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  let cursor = ''
  for (let page = 0; page < 5; page++) {
    const path = `/events?series_ticker=${series}&status=open&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    type Page = {
      events?: Array<{ event_ticker: string; title?: string }>
      cursor?: string
    }
    const r: Page = account
      ? await signedGet<Page>(account, path)
      : ((await (
          await fetch(`${KALSHI_HOST}/trade-api/v2${path}`)
        ).json()) as Page)
    for (const e of r.events ?? []) {
      const at = e.event_ticker.split('-')[1]
      // "Indiana vs Nebraska: Spread" is the same Game.
      const title = e.title?.replace(/:.*$/, '').trim()
      if (at && title) titles.set(at, title)
    }
    cursor = r.cursor ?? ''
    if (!cursor) break
  }
  return titles
}

/**
 * Kalshi's titles for the Games of these markets, by market ticker: for
 * picks published before titles were read. One call a Game; a Game whose
 * title can't be read is left out.
 */
export async function titlesForMarkets(
  account: KalshiAccount,
  marketTickers: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  const eventOf = (ticker: string) => {
    const [series, date] = ticker.toUpperCase().split('-')
    return date ? `${series.replace(/(SPREAD|TOTAL)$/, 'GAME')}-${date}` : null
  }
  const byEvent = new Map<string, string | null>()
  for (const ticker of marketTickers) {
    const event = eventOf(ticker)
    if (!event || byEvent.has(event)) continue
    const r = await signedGet<{ event?: { title?: string } }>(
      account,
      `/events/${event}`,
    ).catch(() => null)
    byEvent.set(event, r?.event?.title?.replace(/:.*$/, '').trim() || null)
  }
  const out = new Map<string, string>()
  for (const ticker of marketTickers) {
    const title = byEvent.get(eventOf(ticker) ?? '')
    if (title) out.set(ticker, title)
  }
  return out
}

/** Our Game for an event: by the teams in its ticker, else by its milestone. */
async function gameOf(
  env: CloudflareEnv,
  account: KalshiAccount | null,
  db: Database,
  refs: ReadonlyArray<GameRef>,
  league: League,
  eventTicker: string,
): Promise<GameRef | null> {
  const parsed = parseEventTicker(eventTicker)
  if (!parsed) return null
  const byTeams = refs.find(
    (g) =>
      g.league === league &&
      (parsed.teams === `${g.away.abbreviation}${g.home.abbreviation}` ||
        parsed.teams === `${g.home.abbreviation}${g.away.abbreviation}`),
  )
  if (byTeams) return byTeams
  if (!account) return null
  const { gameId } = await gameFor(env, account, db, eventTicker).catch(() => ({
    gameId: null,
  }))
  return refs.find((g) => g.gameId === gameId) ?? null
}

/** The team a winner or spread market is about: its ticker's last part. */
function marketTeam(game: GameRef, m: KalshiMarket): string | null {
  const code = m.ticker.split('-').at(-1)?.replace(/\d+$/, '') ?? ''
  if (code === game.home.abbreviation) return game.home.id
  if (code === game.away.abbreviation) return game.away.id
  return m.yes_sub_title ? teamOf(game, m.yes_sub_title) : null
}

/** Every buyable side of today's game markets on our Games. */
export async function kalshiOffers(
  env: CloudflareEnv,
  account: KalshiAccount | null,
  db: Database,
  refs: ReadonlyArray<GameRef>,
  days: ReadonlySet<string>,
): Promise<Array<KalshiOffer>> {
  const offers: Array<KalshiOffer> = []
  const resolved = new Map<string, GameRef | null>()
  const gameTitlesOf = new Map<League, Map<string, string>>()
  for (const { series, league, kind } of SERIES) {
    if (!refs.some((g) => g.league === league)) continue
    if (!gameTitlesOf.has(league)) {
      // Titles only make links nicer: a failed read isn't fatal.
      gameTitlesOf.set(
        league,
        await gameTitles(account, series).catch(() => new Map()),
      )
    }
    for (const m of await openMarkets(account, series)) {
      const parsed = parseEventTicker(m.event_ticker)
      if (!parsed || !days.has(parsed.day)) continue
      // One lookup per game, shared by its winner, spread and total events.
      const gameKey = `${league}:${parsed.day}:${parsed.teams}`
      if (!resolved.has(gameKey))
        resolved.set(
          gameKey,
          await gameOf(env, account, db, refs, league, m.event_ticker),
        )
      const game = resolved.get(gameKey)
      if (!game) continue
      const teamId = kind === 'total' ? null : marketTeam(game, m)
      if (kind !== 'total' && !teamId) continue
      const line = kind === 'moneyline' ? null : (m.floor_strike ?? null)
      if (kind !== 'moneyline' && line === null) continue
      const ask = m.yes_ask_dollars ? dollars(m.yes_ask_dollars) : null
      const bid = m.yes_bid_dollars ? dollars(m.yes_bid_dollars) : null
      if (ask === null || bid === null) continue
      const team = teamId === game.home.id ? game.home : game.away
      const other = teamId === game.home.id ? game.away : game.home
      const label = `${game.away.abbreviation} @ ${game.home.abbreviation}`
      const base = {
        ticker: m.ticker,
        key: { gameId: game.gameId, kind, teamId, line },
        league,
        startsAt: game.startsAt,
        volume: Number((m as { volume_fp?: string }).volume_fp ?? 0),
        gameLabel: label,
        gameTitle:
          gameTitlesOf.get(league)?.get(m.event_ticker.split('-')[1] ?? '') ??
          null,
      }
      const titles =
        kind === 'moneyline'
          ? [`${team.abbreviation} win`, `${other.abbreviation} win`]
          : kind === 'spread'
            ? [
                `${team.abbreviation} −${line}`,
                `${other.abbreviation} +${line}`,
              ]
            : [`Over ${line}`, `Under ${line}`]
      // YES at the ask; NO at one minus the bid (selling YES's other side).
      offers.push(
        { ...base, side: 'yes', price: ask, bid, title: titles[0] },
        { ...base, side: 'no', price: 1 - bid, bid: 1 - ask, title: titles[1] },
      )
    }
  }
  // A winner's NO is the other team's YES: keep both; the engine prices each.
  return offers
}
