/**
 * An Agent's trading tools, for a `trade` token: read a market, propose a
 * Kalshi order for the Viewer to approve (docs/adr/0008), and follow or
 * withdraw its proposals.
 */

import { z } from 'zod'
import { tool } from './mcp'
import { closeTrade, expireTrades, proposeTrade, recentTrades } from './trading'
import { agentTrade, cents, priceField } from './format'
import type { McpTool } from './mcp'
import type { Caller } from './tokens'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { PriceDisplay } from '@/lib/model/price'
import { loadAccount } from '@/lib/kalshi/account'
import { market as fetchMarket } from '@/lib/kalshi/client'
import { maxCentsFor } from '@/lib/model/price'
import { UserError } from '@/lib/userError'

const dollarsOf = (d: string | undefined) =>
  d === undefined ? null : Number(d)
const cent = (d: string | undefined) => cents(dollarsOf(d))

export function tradeTools(
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
          throw new UserError(
            'The Viewer needs a read-only Kalshi key connected (Predictions page) to read markets.',
          )
        }
        const m = await fetchMarket(account, marketTicker)
        if (!m) throw new UserError(`No Kalshi market ${marketTicker}.`)
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
            throw new UserError(
              'Give a sell limitCents: a multiplier is for buying.',
            )
          }
          const c = maxCentsFor(minMultiplier)
          if (c === null) {
            throw new UserError(
              `No Kalshi price pays ${minMultiplier}x after the fee.`,
            )
          }
          limit = limitCents === undefined ? c : Math.min(c, limitCents)
        }
        if (limit === undefined) {
          throw new UserError('Give limitCents, or minMultiplier for a buy.')
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
        "The Viewer's recent trade proposals, newest first, with their status: pending (waiting for the Viewer), rejected, cancelled, expired, placing, unknown (Kalshi didn’t confirm it: it may have gone through, and is being checked), filled, partial, unfilled (nothing at the limit) or failed (with the error), and fills.",
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
      description:
        'Withdraw a proposal of yours the Viewer hasn’t decided yet.',
      input: z.object({ id: z.string().min(1).max(64) }),
      call: async ({ id }) => {
        const row = await closeTrade(
          db,
          caller.viewerId,
          id,
          'cancelled',
          caller.tokenId,
        )
        if (!row) throw new UserError('No pending proposal with that id.')
        return agentTrade(row, Date.now(), display)
      },
    }),
  ]
}
