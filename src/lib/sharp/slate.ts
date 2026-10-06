/**
 * The day's Sharp picks (docs/adr/0006): published each morning (10am
 * Eastern) from the fair prices and Kalshi's markets, then re-checked
 * through the day: the price now and the edge left, the closing price
 * when each Game starts (for closing line value), and the result. Run by
 * the Scheduler. Server only.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  DEFAULT_RULES,
  candidates,
  fairPrices,
  kalshiFee,
  selectCombo,
  selectPicks,
} from './engine'
import { kalshiOffers, serviceAccount } from './kalshi'
import { loadGames, oddsApiQuotes, polymarketQuotes } from './sources'
import type { Candidate, Quote } from './engine'
import type { CloudflareEnv } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import {
  alertSettings,
  kalshiAccounts,
  pushSubscriptions,
  sharpPicks,
} from '@/lib/db/schema'
import { markets } from '@/lib/kalshi/client'
import { dollars } from '@/lib/kalshi/markets'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'
import { reportError } from '@/lib/ops/errors'
import { vapidKeys } from '@/lib/push/deliver'
import { sendPush } from '@/lib/push/webpush'

/** The slate goes out at this hour, Eastern. */
export const PUBLISH_HOUR_ET = 10

const easternHour = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  hourCycle: 'h23',
})

/** Is it time for today's slate (10am Eastern or later)? */
export function publishDue(now: Date): boolean {
  return Number(easternHour.format(now)) >= PUBLISH_HOUR_ET
}

type PickRow = typeof sharpPicks.$inferInsert

function singleRow(
  day: string,
  rank: number,
  c: Candidate,
  at: string,
): PickRow {
  return {
    id: `${day}:${rank}`,
    day,
    rank,
    kind: 'single',
    league: c.league,
    gameId: c.key.gameId,
    startsAt: c.startsAt,
    marketTicker: c.ticker,
    side: c.side,
    marketKind: c.key.kind,
    title: c.title,
    gameLabel: c.gameLabel,
    fair: c.fair,
    price: c.price,
    fee: c.fee,
    edge: c.edge,
    evPerDollar: c.evPerDollar,
    grade: c.grade,
    sources: c.sources,
    createdAt: at,
  }
}

/**
 * Build and store today's slate (once a day). Returns whether today has
 * one now; false when there's nothing to pick from yet (no Games, or no
 * priced Kalshi markets), so the Scheduler tries again later.
 */
export async function publishSlate(
  env: CloudflareEnv,
  now: Date,
): Promise<boolean> {
  const db = dbFromD1(env.DB)
  const day = sportsDayOf(now)
  const existing = await db
    .select({ id: sharpPicks.id })
    .from(sharpPicks)
    .where(eq(sharpPicks.day, day))
    .get()
  if (existing) return true
  const refs = (await loadGames(db, day, day)).filter(
    (g) => g.status === 'scheduled',
  )
  if (refs.length === 0) return false
  const account = await serviceAccount(env, db)
  if (!account) throw new Error('No admin Kalshi account to read prices with')

  // Fair prices: every source we can read (one failing isn't fatal).
  const quotes: Array<Quote> = []
  if (env.ODDS_API_KEY) {
    try {
      const odds = await oddsApiQuotes(env.ODDS_API_KEY, refs)
      quotes.push(...odds.quotes)
      if (odds.remaining !== null && odds.remaining < 60)
        await reportError(
          env,
          'sharp',
          new Error('Odds API credits running low'),
          {
            remaining: odds.remaining,
          },
        )
    } catch (error) {
      await reportError(env, 'sharp', error, { source: 'odds-api' })
    }
  }
  try {
    quotes.push(...(await polymarketQuotes(refs)))
  } catch (error) {
    await reportError(env, 'sharp', error, { source: 'polymarket' })
  }
  const offers = await kalshiOffers(env, account, db, refs, new Set([day]))
  const pool = candidates(offers, fairPrices(quotes), {
    ...DEFAULT_RULES,
    now: now.getTime(),
  })
  const picks = selectPicks(pool)
  if (picks.length === 0) return false
  const at = now.toISOString()
  const rows: Array<PickRow> = picks.map((c, i) => singleRow(day, i + 1, c, at))
  const combo = selectCombo(pool)
  if (combo) {
    rows.push({
      id: `${day}:6`,
      day,
      rank: 6,
      kind: 'combo',
      league: null,
      gameId: null,
      startsAt: combo.legs
        .map((l) => l.startsAt)
        .sort()
        .at(-1)!,
      title: `${combo.legs.length}-leg combo`,
      gameLabel: combo.legs.map((l) => l.gameLabel).join(' · '),
      fair: combo.fair,
      price: combo.impliedPrice,
      fee: kalshiFee(combo.impliedPrice),
      edge: combo.edge,
      evPerDollar:
        combo.edge / (combo.impliedPrice + kalshiFee(combo.impliedPrice)),
      grade:
        combo.edge >= 0.03 ? 'strong' : combo.edge >= 0.01 ? 'edge' : 'thin',
      sources: [],
      legs: combo.legs.map((l) => ({
        marketTicker: l.ticker,
        side: l.side,
        title: l.title,
        gameLabel: l.gameLabel,
        league: l.league,
        startsAt: l.startsAt,
        fair: l.fair,
        price: l.price,
        currentPrice: null,
        closingPrice: null,
        result: null,
      })),
      worthItUnder: combo.worthItUnder,
      createdAt: at,
    })
  }
  for (const r of rows)
    await db.insert(sharpPicks).values(r).onConflictDoNothing()
  await announce(env, rows)
  return true
}

/** The morning push: the slate is out, led by its best pick. */
async function announce(env: CloudflareEnv, rows: ReadonlyArray<PickRow>) {
  const keys = vapidKeys(env)
  if (!keys) return
  const db = dbFromD1(env.DB)
  // Viewers following Predictions (Kalshi connected, Alerts not off).
  const devices = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      level: alertSettings.predictions,
    })
    .from(pushSubscriptions)
    .innerJoin(
      kalshiAccounts,
      eq(kalshiAccounts.viewerId, pushSubscriptions.viewerId),
    )
    .leftJoin(
      alertSettings,
      eq(alertSettings.viewerId, pushSubscriptions.viewerId),
    )
  const top = rows[0]
  const strong = rows.filter(
    (r) => r.kind === 'single' && r.grade === 'strong',
  ).length
  const message = JSON.stringify({
    title: `SHARP PICKS · ${rows.filter((r) => r.kind === 'single').length} picks${rows.some((r) => r.kind === 'combo') ? ' + combo' : ''}`,
    body: `#1 ${top.title} (${top.gameLabel}) · ${(top.edge * 100).toFixed(1)} pts edge at ${Math.round(top.price * 100)}¢${strong > 0 ? ` · ${strong} strong` : ''}`,
    url: '/predictions',
    tag: 'sharp-picks',
    final: false,
  })
  await Promise.allSettled(
    devices
      .filter((d) => d.level !== 'off')
      .map((d) => sendPush(d, message, keys, { topic: 'sharp' })),
  )
}

/** A side's price from a market: what buying it costs, and its midpoint. */
function sidePrices(
  m: { yes_bid_dollars?: string; yes_ask_dollars?: string },
  side: 'yes' | 'no',
): { ask: number; mid: number } | null {
  const bid = m.yes_bid_dollars ? dollars(m.yes_bid_dollars) : null
  const ask = m.yes_ask_dollars ? dollars(m.yes_ask_dollars) : null
  if (bid === null || ask === null || !(ask > 0)) return null
  return side === 'yes'
    ? { ask, mid: (bid + ask) / 2 }
    : { ask: 1 - bid, mid: 1 - (bid + ask) / 2 }
}

/**
 * Re-check the open picks: today's and any earlier ones not yet settled.
 * Before the start: the price now and the edge left. At the start: the
 * closing price. Once Kalshi settles the market: the result.
 */
export async function recheckSlate(
  env: CloudflareEnv,
  now: Date,
): Promise<number> {
  const db = dbFromD1(env.DB)
  const today = sportsDayOf(now)
  const open = await db
    .select()
    .from(sharpPicks)
    .where(
      and(
        inArray(sharpPicks.day, [
          shiftSportsDay(today, -2),
          shiftSportsDay(today, -1),
          today,
        ]),
        isNull(sharpPicks.result),
      ),
    )
  if (open.length === 0) return 0
  const account = await serviceAccount(env, db)
  if (!account) return 0
  const tickers = [
    ...new Set(
      open.flatMap((p) =>
        p.kind === 'combo'
          ? (p.legs ?? []).map((l) => l.marketTicker)
          : p.marketTicker
            ? [p.marketTicker]
            : [],
      ),
    ),
  ]
  const byTicker = new Map(
    (await markets(account, tickers)).map((m) => [m.ticker, m]),
  )
  const started = (startsAt: string) => now.getTime() >= Date.parse(startsAt)
  const settled = (ticker: string, side: 'yes' | 'no') => {
    const r = byTicker.get(ticker)?.result
    return r === 'yes' || r === 'no' ? (r === side ? 'won' : 'lost') : null
  }
  const at = now.toISOString()
  let updated = 0
  for (const p of open) {
    if (p.kind === 'single' && p.marketTicker && p.side) {
      const m = byTicker.get(p.marketTicker)
      const prices = m ? sidePrices(m, p.side) : null
      const result = settled(p.marketTicker, p.side)
      const set: Partial<PickRow> = { checkedAt: at }
      if (!started(p.startsAt) && prices) {
        set.currentPrice = prices.ask
        set.currentEdge = p.fair - prices.ask - kalshiFee(prices.ask)
      }
      // The closing price: the last buy price seen before the start, the
      // same basis as the pick's own price, so closing line value compares
      // like with like.
      if (started(p.startsAt) && p.closingPrice === null)
        set.closingPrice = p.currentPrice ?? prices?.mid ?? null
      if (result) set.result = result
      await db.update(sharpPicks).set(set).where(eq(sharpPicks.id, p.id))
      updated++
    } else if (p.kind === 'combo') {
      const legs = (p.legs ?? []).map((l) => {
        const m = byTicker.get(l.marketTicker)
        const prices = m ? sidePrices(m, l.side) : null
        return {
          ...l,
          currentPrice:
            !started(l.startsAt) && prices ? prices.ask : l.currentPrice,
          closingPrice:
            started(l.startsAt) && l.closingPrice === null
              ? (l.currentPrice ?? prices?.mid ?? null)
              : l.closingPrice,
          result: settled(l.marketTicker, l.side) ?? l.result,
        }
      })
      const result = legs.some((l) => l.result === 'lost')
        ? ('lost' as const)
        : legs.every((l) => l.result === 'won')
          ? ('won' as const)
          : null
      const allClosed = legs.every((l) => l.closingPrice !== null)
      await db
        .update(sharpPicks)
        .set({
          legs,
          checkedAt: at,
          currentPrice: legs.every((l) => l.currentPrice !== null)
            ? legs.reduce((n, l) => n * (l.currentPrice ?? 0), 1)
            : p.currentPrice,
          closingPrice:
            p.closingPrice === null && allClosed
              ? legs.reduce((n, l) => n * (l.closingPrice ?? 0), 1)
              : p.closingPrice,
          ...(result ? { result } : {}),
        })
        .where(eq(sharpPicks.id, p.id))
      updated++
    }
  }
  return updated
}
