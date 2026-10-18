/**
 * How an Agent reads Sportsline: picks, trend picks, the record and trade
 * proposals as tool results. Prices come as the Viewer chose to see them:
 * cents, or a payout multiplier after Kalshi's fee. Chances and edges are
 * in percentage points, as the app shows them. Pure.
 */

import { describeOrder, statusOf } from './proposal'
import type { SharpPick } from '@/lib/sharp/queries'
import type { PickLine } from '@/lib/sharp/record'
import type { TradeProposal } from './proposal'
import type { TrendCombo, TrendPick } from '@/lib/sharp/onDemand'
import type { PriceDisplay } from '@/lib/model/price'
import { kalshiEventUrl } from '@/lib/sharp/view'
import { payoutMultiplier } from '@/lib/model/price'

export const cents = (dollars: number | null) =>
  dollars === null ? null : Math.round(dollars * 1000) / 10
export const points = (fraction: number | null) =>
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
export const feeField = (display: PriceDisplay, fee: number) =>
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
          kalshiUrl: p.marketTicker
            ? kalshiEventUrl(p.marketTicker, p.gameTitle)
            : null,
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
            kalshiUrl: kalshiEventUrl(l.marketTicker, l.gameTitle),
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
    kalshiUrl: kalshiEventUrl(p.ticker, p.gameTitle),
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

/**
 * A trend combo as an Agent reads it: the legs' prices multiplied, roughly
 * what Kalshi will quote for it, and the worst quote worth taking. Pure.
 */
export function agentTrendCombo(
  c: TrendCombo,
  display: PriceDisplay = 'cents',
) {
  return {
    legs: c.legs.length,
    fairPct: points(c.fair),
    ...priceField(display, 'legsTogether', c.impliedPrice),
    edgePoints: points(c.edge),
    ...priceField(
      display,
      display === 'multiplier' ? 'worthItAtLeast' : 'worthItUnder',
      c.worthItUnder,
    ),
    howToPlace:
      "Build it on Kalshi as a combo from the legs' markets; Kalshi quotes the combo's price then. Take it only at the worth-it price or better. propose_trade can't place combos.",
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
