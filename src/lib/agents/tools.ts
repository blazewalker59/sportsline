/**
 * What an Agent can do with Sportsline: read Sharp picks and their record
 * (docs/adr/0007) and, with a `trade` token, propose Kalshi orders for the
 * Viewer to approve (docs/adr/0008, tradeTools.ts). Results are shaped in
 * format.ts.
 */

import { z } from 'zod'
import { tool } from './mcp'
import { tradeTools } from './tradeTools'
import {
  agentLine,
  agentPick,
  agentTrendCombo,
  agentTrendPick,
  points,
  priceField,
} from './format'
import type { McpTool } from './mcp'
import type { Caller } from './tokens'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { PriceDisplay } from '@/lib/model/price'
import { pickHistory, slateOn } from '@/lib/sharp/queries'
import { picksRecord } from '@/lib/sharp/record'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { findBets } from '@/lib/sharp/onDemand'
import { recordRequest, viewerTrendRecord } from '@/lib/sharp/trendRecord'
import { SLATES, leagueFrom } from '@/lib/sharp/lookup'

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
      title: 'Find a trend pick',
      description:
        "A trend pick on demand, for a Team's next game or a League's games today or tomorrow, optionally one kickoff slate, as singles or a combo: Kalshi's offers (winner, main spread, total) priced against our own trends, each Team's recent margins and totals from Sportsline's game history, blended with Kalshi's price. For 'a good bet on the Avs game' pass team 'Avs'; for 'a good NBA bet tonight' pass league 'nba' and day 'today'; for 'a 3-leg college football combo for the noon slate' pass league 'cfb', day 'today', slate 'noon' and legs 3. College football covers games with an ACC, Big 12, Big Ten or SEC team, Notre Dame or a ranked team. These trend picks are weaker than the daily Sharp picks (get_sharp_picks), which use the sharp sportsbooks: say so, and pass on each pick's value and trend note. surprise picks at random among the offers the trends favor.",
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
          .enum(['nfl', 'nba', 'mlb', 'nhl', 'cfb'])
          .optional()
          .describe(
            'cfb is college football. Or a sport word in team, like "hockey" or "college football".',
          ),
        day: z
          .enum(['today', 'tomorrow'])
          .optional()
          .describe("Default: the Team's next game, or today for a League."),
        slate: z
          .enum(SLATES)
          .optional()
          .describe(
            'Only games kicking off in this Eastern window: early (before 11am), noon (11am–2:30pm), afternoon (2:30–6pm, college football’s 3:30 window), evening (6–9:30pm, prime time), late (after 9:30pm).',
          ),
        count: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(3)
          .describe('How many singles. Ignored for a combo.'),
        legs: z
          .number()
          .int()
          .min(2)
          .max(6)
          .optional()
          .describe(
            'Asks for a combo of this many legs instead of singles, each from a different game.',
          ),
        surprise: z.boolean().default(false),
      }),
      call: async ({ team, league, day, slate, count, legs, surprise }) => {
        const asLeague = !league && team ? leagueFrom(team) : null
        const ask = {
          team: asLeague ? undefined : team,
          league: league ?? asLeague,
          day,
          slate,
          count,
          legs,
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
          ...(answer.combo
            ? { combo: agentTrendCombo(answer.combo, display) }
            : {}),
          reason: answer.reason,
          method:
            "Trend picks: each Team's last 7 days of results (or last 3 games), shrunk toward average, give an expected margin and total; that chance is blended 35/65 with Kalshi's own price. Not the sharp books.",
        }
      },
    }),
    tool({
      name: 'get_bet_record',
      title: 'Trend pick record',
      description:
        'What came of find_bet: how many trend picks were asked for, how many were offered, how many the Viewer placed on Kalshi (themselves or through an approved trade proposal) after they were suggested, and how those placed picks did (won, lost, pending, win rate, profit or loss), with how the skipped picks turned out for comparison. Recent picks are listed with their status.',
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
