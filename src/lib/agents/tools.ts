/**
 * What an Agent can do with Sportsline: read Sharp picks and their record
 * (docs/adr/0007) and, with a `trade` token, propose Kalshi orders for the
 * Viewer to approve (docs/adr/0008). Prices come as the Viewer chose to see
 * them: cents, or a payout multiplier after Kalshi's fee. Chances and
 * edges are in percentage points, as the app shows them.
 */

import { z } from 'zod'
import { tool } from './mcp'
import { closeTrade, expireTrades, proposeTrade, recentTrades } from './trading'
import { describeOrder, statusOf } from './proposal'
import type { McpTool } from './mcp'
import type { SharpPick } from '@/lib/sharp/queries'
import type { PickLine } from '@/lib/sharp/record'
import type { Caller } from './tokens'
import type { TradeProposal } from './proposal'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { TrendPick } from '@/lib/sharp/onDemand'
import type { PriceDisplay } from '@/lib/model/price'
import { loadAccount } from '@/lib/kalshi/account'
import { market as fetchMarket } from '@/lib/kalshi/client'
import { pickHistory, slateOn } from '@/lib/sharp/queries'
import { picksRecord } from '@/lib/sharp/record'
import { kalshiEventUrl } from '@/lib/sharp/view'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { findBets } from '@/lib/sharp/onDemand'
import { recordRequest, viewerTrendRecord } from '@/lib/sharp/trendRecord'
import { leagueFrom } from '@/lib/sharp/lookup'
import { maxCentsFor, payoutMultiplier } from '@/lib/model/price'

const UNITS: Record<PriceDisplay, string> = {
  cents:
    'Prices are in cents per $1 contract (fields ending Cents); the Viewer reads prices as cents.',
  multiplier:
    "The Viewer reads prices as payout multipliers: what $1 staked pays back if it wins, after Kalshi's fee (fields ending Multiplier; 1.79x is a 54-cent contract plus its 2-cent fee). Quote prices to them that way.",
}

export function instructions(display: PriceDisplay): string {
  return `Sportsline publishes Sharp picks each morning from 10am Eastern: the day's five Kalshi offers priced furthest below a fair price from the sharp sportsbooks, after Kalshi's fee, plus one combo. ${UNITS[display]} Fair chances, edges and closing line value are in percentage points. Grades: strong (edge 3+ points), edge (1–3), thin (less: the best of a fairly priced day). Picks are information, not advice: read get_sharp_record before trusting them.`
}

export const TRADE_INSTRUCTIONS =
  'This token may also propose Kalshi trades (get_market, propose_trade, get_trades, cancel_trade). A proposal is only a request: the Viewer approves or rejects each one in Sportsline, within 10 minutes, and their dollar limits apply. Never tell the Viewer a trade was made until get_trades shows it filled.'

const cents = (dollars: number | null) =>
  dollars === null ? null : Math.round(dollars * 1000) / 10
const points = (fraction: number | null) =>
  fraction === null ? null : Math.round(fraction * 1000) / 10

/**
 * A price in the Viewer's unit, its name saying which: `priceCents: 54` or
 * `priceMultiplier: 1.79` (what $1 pays back, after the fee). Pure.
 */
export function priceField(
  display: PriceDisplay,
  name: string,
  dollars: number | null,
): Record<string, number | null> {
  return display === 'multiplier'
    ? {
        [`${name}Multiplier`]:
          dollars === null || !(dollars > 0) ? null : payoutMultiplier(dollars),
      }
    : { [`${name}Cents`]: cents(dollars) }
}

/** Kalshi's fee, in cents: only shown with cents (a multiplier includes it). */
const feeField = (display: PriceDisplay, fee: number) =>
  display === 'cents' ? { feeCents: cents(fee) } : {}

/** A pick as an Agent reads it. Pure. */
export function agentPick(p: SharpPick, display: PriceDisplay = 'cents') {
  return {
    rank: p.rank,
    kind: p.kind,
    pick: p.title,
    game: p.gameLabel,
    league: p.league,
    startsAt: p.startsAt,
    grade: p.grade,
    ...priceField(display, 'price', p.price),
    ...feeField(display, p.fee),
    fairPct: points(p.fair),
    edgePoints: points(p.edge),
    evPerDollarPct: points(p.evPerDollar),
    form: p.form?.note ?? null,
    ...(p.kind === 'single'
      ? {
          side: p.side,
          marketKind: p.marketKind,
          marketTicker: p.marketTicker,
          kalshiUrl: p.marketTicker ? kalshiEventUrl(p.marketTicker) : null,
        }
      : {
          // The worst combo quote worth taking: under this price, or
          // paying at least this multiple.
          ...priceField(
            display,
            display === 'multiplier' ? 'worthItAtLeast' : 'worthItUnder',
            p.worthItUnder,
          ),
          legs: (p.legs ?? []).map((l) => ({
            pick: l.title,
            game: l.gameLabel,
            league: l.league,
            startsAt: l.startsAt,
            side: l.side,
            marketTicker: l.marketTicker,
            kalshiUrl: kalshiEventUrl(l.marketTicker),
            ...priceField(display, 'price', l.price),
            fairPct: points(l.fair),
            result: l.result,
          })),
        }),
    sources: p.sources.map((s) => ({
      source: s.source,
      fairPct: points(s.prob),
    })),
    ...priceField(display, 'now', p.currentPrice),
    edgeNowPoints: points(p.currentEdge),
    ...priceField(display, 'closing', p.closingPrice),
    result: p.result,
  }
}

/** A trend pick as an Agent reads it. Pure. */
export function agentTrendPick(p: TrendPick, display: PriceDisplay = 'cents') {
  return {
    pick: p.title,
    game: p.gameLabel,
    league: p.league,
    startsAt: p.startsAt,
    side: p.side,
    marketKind: p.key.kind,
    marketTicker: p.ticker,
    kalshiUrl: kalshiEventUrl(p.ticker),
    ...priceField(display, 'price', p.price),
    ...feeField(display, p.fee),
    trendChancePct: points(p.trendChance),
    fairPct: points(p.fair),
    edgePoints: points(p.edge),
    value:
      p.edge >= 0.01
        ? 'value: our trends favor it after the fee'
        : p.edge > 0
          ? 'slight: barely ahead of the fee'
          : 'none: the least bad on offer, priced against us',
    trend: p.form?.note ?? null,
  }
}

/** A line of the record as an Agent reads it. Pure. */
export function agentLine(l: PickLine) {
  return {
    label: l.label,
    picks: l.picks,
    withClosingPrice: l.closed,
    beatTheClose: l.beatClose,
    avgClosingLineValuePoints: points(l.avgClv),
    won: l.won,
    lost: l.lost,
    roiPct: points(l.roi),
  }
}

/** A trade proposal as an Agent reads it. Pure. */
export function agentTrade(
  p: TradeProposal,
  now: number,
  display: PriceDisplay = 'cents',
) {
  return {
    id: p.id,
    status: statusOf(p, now),
    order: describeOrder(p, display),
    market: p.marketTitle,
    marketTicker: p.marketTicker,
    side: p.side,
    action: p.action,
    count: p.count,
    // The order's own limit is always cents, as Kalshi takes it.
    limitCents: p.limitCents,
    ...(display === 'multiplier' && p.action === 'buy'
      ? { limitMultiplier: payoutMultiplier(p.limitCents / 100) }
      : {}),
    maxCostDollars: p.maxCostDollars,
    note: p.note,
    proposedAt: p.createdAt,
    expiresAt: p.expiresAt,
    decidedAt: p.decidedAt,
    filledCount: p.filledCount,
    ...priceField(display, 'avgPrice', p.avgPriceDollars),
    feesDollars: p.feesDollars,
    error: p.error,
  }
}

const dollarsOf = (d: string | undefined) =>
  d === undefined ? null : Number(d)
const cent = (d: string | undefined) => cents(dollarsOf(d))

export function sportslineTools(
  env: CloudflareEnv,
  db: Database,
  caller: Caller,
  display: PriceDisplay = 'cents',
): Array<McpTool> {
  const read = readTools(env, db, caller, display)
  return caller.scopes.includes('trade')
    ? [...read, ...tradeTools(env, db, caller, display)]
    : read
}

function tradeTools(
  env: CloudflareEnv,
  db: Database,
  caller: Caller,
  display: PriceDisplay,
): Array<McpTool> {
  return [
    tool({
      name: 'get_market',
      title: 'Kalshi market',
      description:
        "A Kalshi market's current prices, status and close time. In cents: YES and NO bid and ask, and the last trade. As multipliers: what buying YES or NO now pays per $1, after the fee. Check it before proposing a trade.",
      input: z.object({
        marketTicker: z
          .string()
          .min(3)
          .max(120)
          .describe('e.g. KXNHLGAME-26OCT07EDMANA-EDM'),
      }),
      call: async ({ marketTicker }) => {
        // Market data is read with the Viewer's read-only key.
        const account = await loadAccount(env, caller.viewerId)
        if (!account) {
          throw new Error(
            'The Viewer needs a read-only Kalshi key connected (Predictions page) to read markets.',
          )
        }
        const m = await fetchMarket(account, marketTicker)
        if (!m) throw new Error(`No Kalshi market ${marketTicker}.`)
        return {
          marketTicker: m.ticker,
          title: m.title ?? null,
          yesMeans: m.yes_sub_title ?? null,
          noMeans: m.no_sub_title ?? null,
          status: m.status ?? null,
          tradable: m.status === 'active',
          ...(display === 'multiplier'
            ? {
                ...priceField(display, 'buyYes', dollarsOf(m.yes_ask_dollars)),
                ...priceField(display, 'buyNo', dollarsOf(m.no_ask_dollars)),
                ...priceField(display, 'last', dollarsOf(m.last_price_dollars)),
              }
            : {
                yesBidCents: cent(m.yes_bid_dollars),
                yesAskCents: cent(m.yes_ask_dollars),
                noBidCents: cent(m.no_bid_dollars),
                noAskCents: cent(m.no_ask_dollars),
                lastCents: cent(m.last_price_dollars),
              }),
          closesAt: m.close_time ?? null,
        }
      },
    }),
    tool({
      name: 'propose_trade',
      title: 'Propose a Kalshi trade',
      description:
        "Propose a Kalshi order for the Viewer to approve. Nothing is traded until they approve it in Sportsline (they're sent an Alert); a proposal lapses after 10 minutes. Orders are limit orders that fill what they can at once and cancel the rest. Buy: pay at most limitCents a contract, or give minMultiplier instead (only fill where $1 pays back at least that, after the fee). Sell: closes contracts the Viewer holds, for at least limitCents. The Viewer's per-order and daily dollar limits apply. Returns the proposal; check it with get_trades.",
      input: z.object({
        marketTicker: z.string().min(3).max(120),
        side: z.enum(['yes', 'no']),
        action: z.enum(['buy', 'sell']),
        count: z.number().int().min(1).max(10_000).describe('Whole contracts.'),
        limitCents: z
          .number()
          .int()
          .min(1)
          .max(99)
          .optional()
          .describe(
            'Worst acceptable price per contract for this side, in cents.',
          ),
        minMultiplier: z
          .number()
          .min(1.01)
          .max(100)
          .optional()
          .describe(
            'Buys only, instead of limitCents: the least $1 may pay back, after the fee (e.g. 1.8).',
          ),
        note: z
          .string()
          .max(500)
          .optional()
          .describe('Why: shown to the Viewer when they decide.'),
      }),
      call: async ({ minMultiplier, limitCents, ...input }) => {
        let limit = limitCents
        if (minMultiplier !== undefined) {
          if (input.action === 'sell') {
            throw new Error(
              'Give a sell limitCents: a multiplier is for buying.',
            )
          }
          const c = maxCentsFor(minMultiplier)
          if (c === null) {
            throw new Error(
              `No Kalshi price pays ${minMultiplier}x after the fee.`,
            )
          }
          limit = limitCents === undefined ? c : Math.min(c, limitCents)
        }
        if (limit === undefined) {
          throw new Error('Give limitCents, or minMultiplier for a buy.')
        }
        return agentTrade(
          await proposeTrade(env, db, caller, { ...input, limitCents: limit }),
          Date.now(),
          display,
        )
      },
    }),
    tool({
      name: 'get_trades',
      title: 'Trade proposals',
      description:
        "The Viewer's recent trade proposals, newest first, with their status: pending (waiting for the Viewer), rejected, cancelled, expired, placing, filled, partial, unfilled (nothing at the limit) or failed (with the error), and fills.",
      input: z.object({}),
      call: async () => {
        await expireTrades(db, caller.viewerId)
        const now = Date.now()
        return {
          trades: (await recentTrades(db, caller.viewerId)).map((p) =>
            agentTrade(p, now, display),
          ),
        }
      },
    }),
    tool({
      name: 'cancel_trade',
      title: 'Cancel a trade proposal',
      description: 'Withdraw a proposal the Viewer hasn’t decided yet.',
      input: z.object({ id: z.string().min(1).max(64) }),
      call: async ({ id }) => {
        const row = await closeTrade(db, caller.viewerId, id, 'cancelled')
        if (!row) throw new Error('No pending proposal with that id.')
        return agentTrade(row, Date.now(), display)
      },
    }),
  ]
}

function readTools(
  env: CloudflareEnv,
  db: Database,
  caller: Caller,
  display: PriceDisplay,
): Array<McpTool> {
  return [
    tool({
      name: 'get_sharp_picks',
      title: 'Sharp picks',
      description:
        "A day's Sharp picks: five singles ranked by value and one combo, each with its Kalshi market, price, fair chance, edge and grade, the sharp books behind the fair price, recent team form, and how it's doing (price now, closing price, result). Defaults to today's slate (yesterday's before 10am Eastern).",
      input: z.object({
        day: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            'Sports Day, YYYY-MM-DD (Eastern). Gives that day’s slate, or the latest one before it.',
          ),
      }),
      call: async ({ day }) => {
        const slate = await slateOn(db, day ?? sportsDayOf(new Date()))
        if (!slate) return { day: null, picks: [] }
        return {
          day: slate.day,
          picks: slate.picks.map((p) => agentPick(p, display)),
        }
      },
    }),
    tool({
      name: 'find_bet',
      title: 'Find a bet',
      description:
        "A good bet on demand, for a Team's next game or a League's games today or tomorrow: Kalshi's offers (winner, main spread, total) priced against our own trends, each Team's recent margins and totals from Sportsline's game history, blended with Kalshi's price. For 'a good bet on the Avs game' pass team 'Avs'; for 'a good NBA bet tonight' pass league 'nba' and day 'today'. These trend picks are weaker than the daily Sharp picks (get_sharp_picks), which use the sharp sportsbooks: say so, and pass on each pick's value and trend note. surprise picks at random among the offers the trends favor.",
      input: z.object({
        team: z
          .string()
          .min(2)
          .max(40)
          .optional()
          .describe(
            'City, nickname, abbreviation or shorthand: Avs, Avalanche, Colorado, COL.',
          ),
        league: z
          .enum(['nfl', 'nba', 'mlb', 'nhl'])
          .optional()
          .describe('Or a sport word in team, like "hockey".'),
        day: z
          .enum(['today', 'tomorrow'])
          .optional()
          .describe("Default: the Team's next game, or today for a League."),
        count: z.number().int().min(1).max(5).default(3),
        surprise: z.boolean().default(false),
      }),
      call: async ({ team, league, day, count, surprise }) => {
        const asLeague = !league && team ? leagueFrom(team) : null
        const ask = {
          team: asLeague ? undefined : team,
          league: league ?? asLeague,
          day,
          count,
          surprise,
        }
        const answer = await findBets(env, db, caller.viewerId, ask)
        // Every ask is kept, so the record can say what came of its picks.
        const requestId = await recordRequest(db, caller, ask, answer)
        return {
          requestId,
          games: answer.games.map((g) => ({
            game: `${g.away.name} @ ${g.home.name}`,
            league: g.league,
            startsAt: g.startsAt,
          })),
          picks: answer.picks.map((p) => agentTrendPick(p, display)),
          reason: answer.reason,
          method:
            "Trend picks: each Team's last 7 days of results (or last 3 games), shrunk toward average, give an expected margin and total; that chance is blended 35/65 with Kalshi's own price. Not the sharp books.",
        }
      },
    }),
    tool({
      name: 'get_bet_record',
      title: 'find_bet record',
      description:
        'What came of find_bet: how many bets were asked for, how many picks were offered, how many the Viewer placed on Kalshi (themselves or through an approved trade proposal) after they were suggested, and how those placed picks did (won, lost, pending, win rate, profit or loss), with how the skipped picks turned out for comparison. Recent picks are listed with their status.',
      input: z.object({
        recent: z.number().int().min(0).max(50).default(10),
      }),
      call: async ({ recent }) => {
        const record = await viewerTrendRecord(db, caller.viewerId)
        return {
          ...record.stats,
          winRatePct: points(record.stats.winRate),
          recentPicks: [...record.picks]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, recent)
            .map((p) => ({
              pick: p.title,
              game: p.gameLabel,
              suggestedAt: p.createdAt,
              ...priceField(display, 'price', p.price),
              edgePoints: points(p.edge),
              placed: p.placedAt !== null,
              placedVia: p.placedVia,
              placedCost: p.placedCost,
              result: p.result ?? 'pending',
              pnl: p.pnl,
            })),
        }
      },
    }),
    tool({
      name: 'get_sharp_record',
      title: 'Sharp picks record',
      description:
        "How Sharp picks have done so far: closing line value first (how often Kalshi's price moved toward a pick by its start, the best early sign the method works), then wins, losses and return on cost, overall, for singles and combos, and for singles by grade.",
      input: z.object({}),
      call: async () => {
        const record = picksRecord(await pickHistory(db))
        return {
          all: agentLine(record.all),
          singles: agentLine(record.singles),
          combos: agentLine(record.combos),
          byGrade: record.byGrade.map(agentLine),
        }
      },
    }),
  ]
}
