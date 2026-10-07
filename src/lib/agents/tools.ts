/**
 * What an Agent can do with Sportsline (docs/adr/0007): read Sharp picks
 * and their record. Prices are in cents, chances and edges in percentage
 * points, as the app shows them.
 */

import { z } from 'zod'
import { tool } from './mcp'
import type { McpTool } from './mcp'
import type { SharpPick } from '@/lib/sharp/queries'
import type { PickLine } from '@/lib/sharp/record'
import type { Database } from '@/lib/db'
import { pickHistory, slateOn } from '@/lib/sharp/queries'
import { picksRecord } from '@/lib/sharp/record'
import { kalshiEventUrl } from '@/lib/sharp/view'
import { sportsDayOf } from '@/lib/model/sportsDay'

export const INSTRUCTIONS =
  "Sportsline publishes Sharp picks each morning from 10am Eastern: the day's five Kalshi offers priced furthest below a fair price from the sharp sportsbooks, after Kalshi's fee, plus one combo. Prices are in cents per $1 contract; fair chances, edges and closing line value are in percentage points. Grades: strong (edge 3+ points), edge (1–3), thin (less: the best of a fairly priced day). Picks are information, not advice: read get_sharp_record before trusting them."

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

export function sportslineTools(db: Database): Array<McpTool> {
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
