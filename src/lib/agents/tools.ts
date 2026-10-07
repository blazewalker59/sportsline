/**
 * What an Agent can do with Sportsline: read Sharp picks and their record
 * (docs/adr/0007) and, with a `trade` token, propose Kalshi orders for the
 * Viewer to approve (docs/adr/0008). Prices are in cents, chances and
 * edges in percentage points, as the app shows them.
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
import { loadAccount } from '@/lib/kalshi/account'
import { market as fetchMarket } from '@/lib/kalshi/client'
import { pickHistory, slateOn } from '@/lib/sharp/queries'
import { picksRecord } from '@/lib/sharp/record'
import { kalshiEventUrl } from '@/lib/sharp/view'
import { sportsDayOf } from '@/lib/model/sportsDay'

export const INSTRUCTIONS =
  "Sportsline publishes Sharp picks each morning from 10am Eastern: the day's five Kalshi offers priced furthest below a fair price from the sharp sportsbooks, after Kalshi's fee, plus one combo. Prices are in cents per $1 contract; fair chances, edges and closing line value are in percentage points. Grades: strong (edge 3+ points), edge (1–3), thin (less: the best of a fairly priced day). Picks are information, not advice: read get_sharp_record before trusting them."

export const TRADE_INSTRUCTIONS =
  'This token may also propose Kalshi trades (get_market, propose_trade, get_trades, cancel_trade). A proposal is only a request: the Viewer approves or rejects each one in Sportsline, within 10 minutes, and their dollar limits apply. Never tell the Viewer a trade was made until get_trades shows it filled.'

const cents = (dollars: number | null) =>
  dollars === null ? null : Math.round(dollars * 1000) / 10
const points = (fraction: number | null) =>
  fraction === null ? null : Math.round(fraction * 1000) / 10

/** A pick as an Agent reads it. Pure. */
export function agentPick(p: SharpPick) {
  return {
    rank: p.rank,
    kind: p.kind,
    pick: p.title,
    game: p.gameLabel,
    league: p.league,
    startsAt: p.startsAt,
    grade: p.grade,
    priceCents: cents(p.price),
    feeCents: cents(p.fee),
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
          worthItUnderCents: cents(p.worthItUnder),
          legs: (p.legs ?? []).map((l) => ({
            pick: l.title,
            game: l.gameLabel,
            league: l.league,
            startsAt: l.startsAt,
            side: l.side,
            marketTicker: l.marketTicker,
            kalshiUrl: kalshiEventUrl(l.marketTicker),
            priceCents: cents(l.price),
            fairPct: points(l.fair),
            result: l.result,
          })),
        }),
    sources: p.sources.map((s) => ({
      source: s.source,
      fairPct: points(s.prob),
    })),
    nowCents: cents(p.currentPrice),
    edgeNowPoints: points(p.currentEdge),
    closingCents: cents(p.closingPrice),
    result: p.result,
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
export function agentTrade(p: TradeProposal, now: number) {
  return {
    id: p.id,
    status: statusOf(p, now),
    order: describeOrder(p),
    market: p.marketTitle,
    marketTicker: p.marketTicker,
    side: p.side,
    action: p.action,
    count: p.count,
    limitCents: p.limitCents,
    maxCostDollars: p.maxCostDollars,
    note: p.note,
    proposedAt: p.createdAt,
    expiresAt: p.expiresAt,
    decidedAt: p.decidedAt,
    filledCount: p.filledCount,
    avgPriceCents: cents(p.avgPriceDollars),
    feesDollars: p.feesDollars,
    error: p.error,
  }
}

const cent = (dollars: string | undefined) =>
  dollars === undefined ? null : cents(Number(dollars))

export function sportslineTools(
  env: CloudflareEnv,
  db: Database,
  caller: Caller,
): Array<McpTool> {
  const read = readTools(db)
  return caller.scopes.includes('trade')
    ? [...read, ...tradeTools(env, db, caller)]
    : read
}

function tradeTools(
  env: CloudflareEnv,
  db: Database,
  caller: Caller,
): Array<McpTool> {
  return [
    tool({
      name: 'get_market',
      title: 'Kalshi market',
      description:
        "A Kalshi market's current prices (YES and NO bid and ask, last trade, in cents), status and close time. Check it before proposing a trade.",
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
          yesBidCents: cent(m.yes_bid_dollars),
          yesAskCents: cent(m.yes_ask_dollars),
          noBidCents: cent(m.no_bid_dollars),
          noAskCents: cent(m.no_ask_dollars),
          lastCents: cent(m.last_price_dollars),
          closesAt: m.close_time ?? null,
        }
      },
    }),
    tool({
      name: 'propose_trade',
      title: 'Propose a Kalshi trade',
      description:
        "Propose a Kalshi order for the Viewer to approve. Nothing is traded until they approve it in Sportsline (they're sent an Alert); a proposal lapses after 10 minutes. Orders are limit orders that fill what they can at once and cancel the rest. Buy: pay at most limitCents a contract. Sell: closes contracts the Viewer holds, for at least limitCents. The Viewer's per-order and daily dollar limits apply. Returns the proposal; check it with get_trades.",
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
          .describe(
            'Worst acceptable price per contract for this side, in cents.',
          ),
        note: z
          .string()
          .max(500)
          .optional()
          .describe('Why: shown to the Viewer when they decide.'),
      }),
      call: async (input) =>
        agentTrade(await proposeTrade(env, db, caller, input), Date.now()),
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
            agentTrade(p, now),
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
        return agentTrade(row, Date.now())
      },
    }),
  ]
}

function readTools(db: Database): Array<McpTool> {
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
        return { day: slate.day, picks: slate.picks.map(agentPick) }
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
