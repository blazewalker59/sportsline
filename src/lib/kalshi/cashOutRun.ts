/**
 * Cashing out a Prediction on Kalshi (CONTEXT.md, "Cash out";
 * docs/adr/0012), with the Viewer's trade key (docs/adr/0008), never their
 * read-only connection (docs/adr/0003). Server only.
 *
 * A single sells into its market's book: one limit order, immediate-or-
 * cancel and reduce-only, so it can never buy, open or flip a position.
 * A Combo has no book, so it sells through a quote: Sportsline asks Kalshi's
 * market makers (an RFQ), shows the best price, and accepts it when the
 * Viewer confirms; Kalshi's maker then confirms and it executes within
 * seconds. A quote has no reduce-only guard, so the Viewer's position is
 * read again just before accepting, and never more than it is sold.
 *
 * Every cash out is recorded once (its id is the order's client order id),
 * never retried, and one whose answer was lost is looked up later
 * (reconcileCashOuts, from the Viewer's ViewerSync).
 */

import { and, eq, inArray, lte } from 'drizzle-orm'
import {
  MAX_ALLOWANCE_CENTS,
  PORTFOLIO_URL,
  acceptSide,
  bestQuote,
  eventUrl,
  heldOn,
  limitFor,
  proceeds,
  sellCents,
  validCount,
} from './cashOut'
import {
  KalshiError,
  event as fetchEvent,
  market as fetchMarket,
  positionIn,
  signedDelete,
  signedGet,
  signedPost,
  signedPut,
} from './client'
import { loadAccount } from './account'
import { placeOrder } from './orders'
import type { KalshiQuote } from './cashOut'
import type { KalshiAccount } from './client'
import type { CloudflareEnv, Database } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import {
  cashOuts,
  kalshiEvents,
  predictionLegs,
  predictions,
} from '@/lib/db/schema'
import { fillStatus, tradeAccount, tradeKeyRow } from '@/lib/agents/trading'
import { fillsOf, findOrder } from '@/lib/agents/reconcile'
import { reportError } from '@/lib/ops/errors'
import { UserError } from '@/lib/userError'

type Env = Pick<CloudflareEnv, 'DB' | 'KALSHI_ENCRYPTION_KEY'>
type CashOutRow = typeof cashOuts.$inferSelect

export type CashOutStatus = CashOutRow['status']

/** Still in flight: the Viewer's ViewerSync looks these up. */
export const UNSETTLED_CASH_OUTS: Array<CashOutStatus> = [
  'placing',
  'accepted',
  'unknown',
  'quoting',
]

/** A quote request left open this long is dropped. */
export const QUOTE_TTL_MS = 5 * 60_000
/** After accepting: the maker confirms (3 s for a Combo) and it executes. */
const EXECUTE_WAIT_MS = 8_000
const POLL_MS = 750

/** What the Prediction sheet's Cash out shows before anything is sent. */
export interface CashOutPreview {
  kind: 'single' | 'combo'
  side: 'yes' | 'no'
  title: string
  /** Contracts held, as last synced. */
  held: number
  /** A trade key is connected: Cash out can sell. */
  trading: boolean
  /** A single's market right now (null for a Combo). */
  single: {
    open: boolean
    /** What a contract sells for now, in cents (null: no one's buying). */
    cents: number | null
    /** The order's worst price: `cents` less the allowance. */
    limitCents: number | null
  } | null
}

/** The Viewer's cash outs: the record a sheet shows, newest first. */
export interface CashOutView {
  id: string
  status: CashOutStatus
  kind: 'single' | 'combo'
  side: 'yes' | 'no'
  count: number
  filledCount: number | null
  avgPriceDollars: number | null
  feesDollars: number | null
  /** A Combo's best quote right now, while it's quoting. */
  quote: {
    id: string
    price: number
    gross: number
    fees: number
    net: number
  } | null
  error: string | null
}

async function openPrediction(db: Database, viewerId: string, id: string) {
  const p = await db
    .select()
    .from(predictions)
    .where(and(eq(predictions.id, id), eq(predictions.viewerId, viewerId)))
    .get()
  if (!p) throw new UserError('No such Prediction.')
  if (p.status !== 'open') {
    throw new UserError(
      'This Prediction has settled: there’s nothing to cash out.',
    )
  }
  return p
}

async function trader(env: Env, db: Database, viewerId: string) {
  const key = await tradeKeyRow(db, viewerId)
  if (!key) {
    throw new UserError(
      'Cashing out sells with a Kalshi trade key. Connect one on the Agents page.',
    )
  }
  return tradeAccount(env as CloudflareEnv, key)
}

const dollars = (v: string | undefined) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** What cashing out would do now, before anything is sent. */
export async function previewCashOut(
  env: Env,
  viewerId: string,
  predictionId: string,
): Promise<CashOutPreview> {
  const db = dbFromD1(env.DB)
  const p = await openPrediction(db, viewerId, predictionId)
  const key = await tradeKeyRow(db, viewerId)
  const base = {
    kind: p.kind,
    side: p.side,
    title: p.title,
    held: p.contracts,
    trading: Boolean(key),
  }
  if (p.kind === 'combo') return { ...base, single: null }
  const reader = key
    ? await tradeAccount(env as CloudflareEnv, key)
    : await loadAccount(env as CloudflareEnv, viewerId)
  if (!reader)
    return { ...base, single: { open: false, cents: null, limitCents: null } }
  const m = await fetchMarket(reader, p.marketTicker)
  const cents = m
    ? sellCents(p.side, {
        yesBid: dollars(m.yes_bid_dollars),
        noBid: dollars(m.no_bid_dollars),
      })
    : null
  return {
    ...base,
    single: {
      open: m?.status === 'active',
      cents,
      limitCents: cents === null ? null : limitFor(cents),
    },
  }
}

function view(
  row: CashOutRow,
  quote: CashOutView['quote'] = null,
): CashOutView {
  return {
    id: row.id,
    status: row.status,
    kind: row.kind,
    side: row.side,
    count: row.count,
    filledCount: row.filledCount,
    avgPriceDollars: row.avgPriceDollars,
    feesDollars: row.feesDollars,
    quote,
    error: row.error,
  }
}

async function update(
  db: Database,
  id: string,
  set: Partial<CashOutRow>,
  now: Date,
  /** Only from these statuses (so an outcome is never overwritten). */
  from?: Array<CashOutStatus>,
): Promise<CashOutRow | undefined> {
  const [row] = await db
    .update(cashOuts)
    .set({ ...set, updatedAt: now.toISOString() })
    .where(
      and(
        eq(cashOuts.id, id),
        from ? inArray(cashOuts.status, from) : undefined,
      ),
    )
    .returning()
  return row
}

/** Insert the record first: the same id can never be sent twice. */
async function record(
  db: Database,
  row: Omit<CashOutRow, 'updatedAt'>,
): Promise<void> {
  try {
    await db.insert(cashOuts).values({ ...row, updatedAt: row.createdAt })
  } catch {
    throw new UserError('This cash out was already sent.')
  }
}

/** Kalshi refused it (4xx): nothing happened. Anything else may have. */
function refused(error: unknown): boolean {
  return (
    error instanceof KalshiError && error.status >= 400 && error.status < 500
  )
}

// ─── A single: one reduce-only order into the book ─────────────────────────

export async function sellSingle(
  env: Env,
  viewerId: string,
  input: {
    predictionId: string
    id: string
    count: number
    limitCents: number
  },
  now = new Date(),
): Promise<CashOutView> {
  const db = dbFromD1(env.DB)
  const p = await openPrediction(db, viewerId, input.predictionId)
  if (p.kind !== 'single') throw new UserError('A Combo cashes out by quote.')
  if (!validCount(input.count, p.contracts)) {
    throw new UserError(`You can sell up to ${p.contracts} contracts.`)
  }
  const account = await trader(env, db, viewerId)
  // The price moved more than the allowance since it was shown: show it again.
  const m = await fetchMarket(account, p.marketTicker)
  if (m?.status !== 'active') {
    throw new UserError('Kalshi isn’t trading this market right now.')
  }
  const cents = sellCents(p.side, {
    yesBid: dollars(m.yes_bid_dollars),
    noBid: dollars(m.no_bid_dollars),
  })
  if (cents === null) throw new UserError('No one’s buying this right now.')
  if (
    !Number.isInteger(input.limitCents) ||
    input.limitCents < 1 ||
    input.limitCents > 99 ||
    input.limitCents < cents - MAX_ALLOWANCE_CENTS
  ) {
    throw new UserError('The price has moved. Look again before you cash out.')
  }

  await record(db, {
    id: input.id,
    viewerId,
    predictionId: p.id,
    marketTicker: p.marketTicker,
    title: p.title,
    kind: 'single',
    side: p.side,
    count: input.count,
    method: 'order',
    limitCents: input.limitCents,
    quotePrice: null,
    expectedDollars: proceeds(input.count, cents / 100).gross,
    status: 'placing',
    rfqId: null,
    quoteId: null,
    orderId: null,
    filledCount: null,
    avgPriceDollars: null,
    feesDollars: null,
    error: null,
    createdAt: now.toISOString(),
    sentAt: now.toISOString(),
  })
  try {
    const result = await placeOrder(
      account,
      p.marketTicker,
      {
        side: p.side,
        action: 'sell',
        count: input.count,
        limitCents: input.limitCents,
      },
      input.id,
    )
    const row = await update(
      db,
      input.id,
      {
        status: fillStatus(result.filled, input.count),
        orderId: result.orderId,
        filledCount: result.filled,
        avgPriceDollars: result.avgPrice,
        feesDollars: result.fees,
      },
      now,
    )
    return view(row!)
  } catch (error) {
    await reportError(env as CloudflareEnv, 'cash-out', error, {
      step: 'order',
      id: input.id,
    })
    const row = await update(
      db,
      input.id,
      {
        status: refused(error) ? 'failed' : 'unknown',
        error: error instanceof Error ? error.message : String(error),
      },
      now,
    )
    return view(row!)
  }
}

// ─── A Combo: a quote from market makers ───────────────────────────────────

interface Rfq {
  id: string
  market_ticker?: string
  status?: string
}

/** Our own open quote request on a market, to replace. */
async function ownOpenRfq(
  account: KalshiAccount,
  ticker: string,
): Promise<Rfq | null> {
  const r = await signedGet<{ rfqs?: Array<Rfq> }>(
    account,
    `/communications/rfqs?user_filter=self&status=open&market_ticker=${encodeURIComponent(ticker)}`,
  )
  return r.rfqs?.find((x) => x.market_ticker === ticker) ?? null
}

async function heldNow(
  account: KalshiAccount,
  ticker: string,
  side: 'yes' | 'no',
): Promise<number> {
  return heldOn(side, await positionIn(account, ticker))
}

/** Ask Kalshi's market makers for a price on the Combo held. */
export async function requestQuote(
  env: Env,
  viewerId: string,
  input: { predictionId: string; id: string; count: number },
  now = new Date(),
): Promise<CashOutView> {
  const db = dbFromD1(env.DB)
  const p = await openPrediction(db, viewerId, input.predictionId)
  if (p.kind !== 'combo') throw new UserError('A single cashes out by order.')
  const account = await trader(env, db, viewerId)
  const held = await heldNow(account, p.marketTicker, p.side)
  if (!validCount(input.count, held)) {
    throw new UserError(
      held > 0
        ? `You can sell up to ${held} contracts.`
        : 'Kalshi shows no position here to sell.',
    )
  }
  await record(db, {
    id: input.id,
    viewerId,
    predictionId: p.id,
    marketTicker: p.marketTicker,
    title: p.title,
    kind: 'combo',
    side: p.side,
    count: input.count,
    method: 'quote',
    limitCents: null,
    quotePrice: null,
    expectedDollars: null,
    status: 'quoting',
    rfqId: null,
    quoteId: null,
    orderId: null,
    filledCount: null,
    avgPriceDollars: null,
    feesDollars: null,
    error: null,
    createdAt: now.toISOString(),
    sentAt: null,
  })
  const body = {
    market_ticker: p.marketTicker,
    contracts_fp: input.count.toFixed(2),
    rest_remainder: false,
    obscure_creator_id: true,
  }
  try {
    let rfq: { id: string }
    try {
      rfq = await signedPost<{ id: string }>(
        account,
        '/communications/rfqs',
        body,
      )
    } catch (error) {
      // One open request per market: an earlier one of ours (left open) goes.
      if (!(error instanceof KalshiError && error.status === 409)) throw error
      const old = await ownOpenRfq(account, p.marketTicker)
      if (!old) throw error
      await signedDelete(
        account,
        `/communications/rfqs/${encodeURIComponent(old.id)}`,
      )
      rfq = await signedPost<{ id: string }>(
        account,
        '/communications/rfqs',
        body,
      )
    }
    const row = await update(db, input.id, { rfqId: rfq.id }, now)
    return view(row!)
  } catch (error) {
    await reportError(env as CloudflareEnv, 'cash-out', error, {
      step: 'rfq',
      id: input.id,
    })
    const row = await update(
      db,
      input.id,
      {
        status: 'failed',
        error:
          error instanceof KalshiError && error.status === 400
            ? 'Kalshi isn’t taking quote requests on this Combo right now.'
            : error instanceof Error
              ? error.message
              : String(error),
      },
      now,
    )
    return view(row!)
  }
}

async function ownCashOut(db: Database, viewerId: string, id: string) {
  const row = await db
    .select()
    .from(cashOuts)
    .where(and(eq(cashOuts.id, id), eq(cashOuts.viewerId, viewerId)))
    .get()
  if (!row) throw new UserError('No such cash out.')
  return row
}

async function quotesFor(account: KalshiAccount, rfqId: string) {
  const r = await signedGet<{ quotes?: Array<KalshiQuote> }>(
    account,
    `/communications/quotes?rfq_id=${encodeURIComponent(rfqId)}&status=open`,
  )
  return r.quotes ?? []
}

/** A cash out as it stands, with a Combo's best quote while quoting. */
export async function readCashOut(
  env: Env,
  viewerId: string,
  id: string,
  now = new Date(),
): Promise<CashOutView> {
  const db = dbFromD1(env.DB)
  const row = await ownCashOut(db, viewerId, id)
  if (row.status !== 'quoting' || !row.rfqId) return view(row)
  if (now.getTime() - Date.parse(row.createdAt) > QUOTE_TTL_MS) {
    return dropQuote(env, viewerId, id, now)
  }
  const account = await trader(env, db, viewerId)
  const best = bestQuote(row.side, await quotesFor(account, row.rfqId))
  if (!best) return view(row)
  return view(row, {
    id: best.quote.id,
    price: best.price,
    ...proceeds(row.count, best.price),
  })
}

/**
 * The Viewer takes a quote: claim the cash out (once), read the position
 * again (a quote can't be reduce-only), check the quote is still there at
 * no worse a price than they saw, and accept it. Then wait the seconds the
 * maker has to confirm and Kalshi to execute.
 */
export async function acceptQuote(
  env: Env,
  viewerId: string,
  input: { id: string; quoteId: string; price: number },
  now = new Date(),
): Promise<CashOutView> {
  const db = dbFromD1(env.DB)
  const row = await ownCashOut(db, viewerId, input.id)
  if (row.status !== 'quoting' || !row.rfqId) {
    throw new UserError('This cash out has already been decided.')
  }
  const account = await trader(env, db, viewerId)
  const held = await heldNow(account, row.marketTicker, row.side)
  if (!validCount(row.count, held)) {
    await update(
      db,
      row.id,
      {
        status: 'failed',
        error: 'Kalshi shows fewer contracts held than this would sell.',
      },
      now,
      ['quoting'],
    )
    throw new UserError(
      'Kalshi shows fewer contracts than this would sell, so nothing was sent.',
    )
  }
  const quotes = await quotesFor(account, row.rfqId)
  const q = quotes.find((x) => x.id === input.quoteId)
  const best = q ? bestQuote(row.side, [q]) : null
  if (!best || best.price < input.price - 1e-9) {
    throw new UserError('That price was withdrawn. Wait for the next one.')
  }
  // One tap wins.
  const claimed = await update(
    db,
    row.id,
    {
      status: 'accepted',
      quoteId: input.quoteId,
      quotePrice: best.price,
      expectedDollars: proceeds(row.count, best.price).gross,
      sentAt: now.toISOString(),
    },
    now,
    ['quoting'],
  )
  if (!claimed) throw new UserError('This cash out has already been decided.')
  try {
    await signedPut(
      account,
      `/communications/rfqs/${encodeURIComponent(row.rfqId)}/quotes/${encodeURIComponent(input.quoteId)}/accept`,
      { accepted_side: acceptSide(row.side) },
    )
  } catch (error) {
    await reportError(env as CloudflareEnv, 'cash-out', error, {
      step: 'accept',
      id: row.id,
    })
    const done = await update(
      db,
      row.id,
      refused(error)
        ? {
            status: 'unfilled',
            error: 'That price was gone by the time it was accepted.',
          }
        : {
            status: 'unknown',
            error: error instanceof Error ? error.message : String(error),
          },
      now,
      ['accepted'],
    )
    return view(done!)
  }
  // The maker confirms (3 s for a Combo), then it executes (1 s).
  const until = Date.now() + EXECUTE_WAIT_MS
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    const settled = await settleQuote(db, account, claimed, now)
    if (settled) return view(settled)
  }
  return view(await ownCashOut(db, viewerId, row.id))
}

/** Settle an accepted quote from Kalshi's record; undefined if not yet. */
async function settleQuote(
  db: Database,
  account: KalshiAccount,
  row: CashOutRow,
  now: Date,
): Promise<CashOutRow | undefined> {
  if (!row.rfqId || !row.quoteId) return undefined
  let q: KalshiQuote
  try {
    const r = await signedGet<{ quote?: KalshiQuote }>(
      account,
      `/communications/rfqs/${encodeURIComponent(row.rfqId)}/quotes/${encodeURIComponent(row.quoteId)}`,
    )
    if (!r.quote) return undefined
    q = r.quote
  } catch {
    return undefined
  }
  if (q.status === 'cancelled' || q.cancelled_ts) {
    return update(
      db,
      row.id,
      {
        status: 'unfilled',
        error: 'The market maker didn’t confirm, so nothing was sold.',
      },
      now,
      ['accepted', 'unknown'],
    )
  }
  if (q.status !== 'executed' && !q.executed_ts) return undefined
  const orderId = q.rfq_creator_order_id
  const fills = orderId
    ? await fillsOf(account, { side: row.side }, orderId)
    : null
  // Executed, but its fills aren't listed yet: look again.
  if (!fills || fills.filled === 0) return undefined
  return update(
    db,
    row.id,
    {
      status: fillStatus(fills.filled, row.count),
      orderId,
      filledCount: fills.filled,
      avgPriceDollars: fills.avgPrice,
      feesDollars: fills.fees,
      error: null,
    },
    now,
    ['accepted', 'unknown'],
  )
}

/** The Viewer leaves, or no price came: close the request. */
export async function dropQuote(
  env: Env,
  viewerId: string,
  id: string,
  now = new Date(),
): Promise<CashOutView> {
  const db = dbFromD1(env.DB)
  const row = await ownCashOut(db, viewerId, id)
  if (row.status !== 'quoting') return view(row)
  const done = await update(db, id, { status: 'expired' }, now, ['quoting'])
  if (row.rfqId) {
    const key = await tradeKeyRow(db, viewerId)
    if (key) {
      const account = await tradeAccount(env as CloudflareEnv, key)
      await signedDelete(
        account,
        `/communications/rfqs/${encodeURIComponent(row.rfqId)}`,
      ).catch(() => undefined)
    }
  }
  return view(done ?? row)
}

// ─── Settling what's in flight (the Viewer's ViewerSync) ───────────────────

/** Left this long before it's looked up. */
export const SETTLE_AFTER_MS = 3 * 60_000

/**
 * Settle a Viewer's cash outs still in flight: an order whose answer was
 * lost (looked up by its client order id), a quote accepted but not seen
 * to execute, a quote request left open. Returns how many were settled.
 */
export async function reconcileCashOuts(
  env: Env,
  viewerId: string,
  now = new Date(),
): Promise<number> {
  const db = dbFromD1(env.DB)
  const open = await db
    .select()
    .from(cashOuts)
    .where(
      and(
        eq(cashOuts.viewerId, viewerId),
        inArray(cashOuts.status, UNSETTLED_CASH_OUTS),
        lte(
          cashOuts.updatedAt,
          new Date(now.getTime() - SETTLE_AFTER_MS).toISOString(),
        ),
      ),
    )
  if (open.length === 0) return 0
  const key = await tradeKeyRow(db, viewerId)
  const account = key
    ? await tradeAccount(env as CloudflareEnv, key)
    : await loadAccount(env as CloudflareEnv, viewerId)
  if (!account) return 0
  let settled = 0
  for (const row of open) {
    if (row.status === 'quoting') {
      if (key && (await dropQuote(env, viewerId, row.id, now))) settled++
      continue
    }
    if (row.method === 'quote') {
      if (await settleQuote(db, account, row, now)) settled++
      continue
    }
    const order = await findOrder(account, {
      id: row.id,
      marketTicker: row.marketTicker,
      decidedAt: row.sentAt,
      createdAt: row.createdAt,
    })
    let set: Partial<CashOutRow>
    if (!order) {
      set = {
        status: 'failed',
        error: 'Kalshi has no record of this order, so nothing was sold.',
      }
    } else {
      if (order.status === 'resting') continue
      const fills = await fillsOf(account, { side: row.side }, order.order_id)
      const reported = Number(order.fill_count_fp ?? order.fill_count ?? 0) || 0
      if (reported > fills.filled) continue
      set = {
        status: fillStatus(fills.filled, row.count),
        orderId: order.order_id,
        filledCount: fills.filled,
        avgPriceDollars: fills.avgPrice,
        feesDollars: fills.fees,
        error: null,
      }
    }
    if (await update(db, row.id, set, now, ['placing', 'unknown'])) settled++
  }
  return settled
}

// ─── Kalshi's pages for a Prediction ───────────────────────────────────────

export interface KalshiLinks {
  /** The single's event page (null for a Combo, or when it can't be read). */
  market: string | null
  /** The Viewer's portfolio: where a Combo lives. */
  portfolio: string
  /** Each Leg's event page, by event ticker. */
  legs: Record<string, string>
}

/**
 * Where a Prediction lives on Kalshi. An event's series is read from
 * Kalshi once and remembered (kalshi_events), never parsed from a ticker.
 */
export async function kalshiLinks(
  env: Env,
  viewerId: string,
  predictionId: string,
): Promise<KalshiLinks | null> {
  const db = dbFromD1(env.DB)
  const p = await db
    .select()
    .from(predictions)
    .where(
      and(eq(predictions.id, predictionId), eq(predictions.viewerId, viewerId)),
    )
    .get()
  if (!p) return null
  const legs = await db
    .select({ eventTicker: predictionLegs.eventTicker })
    .from(predictionLegs)
    .where(eq(predictionLegs.predictionId, p.id))
  const tickers = [...new Set(legs.map((l) => l.eventTicker))]
  const known = tickers.length
    ? await db
        .select({
          eventTicker: kalshiEvents.eventTicker,
          seriesTicker: kalshiEvents.seriesTicker,
        })
        .from(kalshiEvents)
        .where(inArray(kalshiEvents.eventTicker, tickers))
    : []
  const series = new Map(
    known.flatMap((k) =>
      k.seriesTicker ? [[k.eventTicker, k.seriesTicker]] : [],
    ),
  )
  const missing = tickers.filter((t) => !series.has(t))
  if (missing.length > 0) {
    const key = await tradeKeyRow(db, viewerId)
    const account =
      (await loadAccount(env as CloudflareEnv, viewerId)) ??
      (key ? await tradeAccount(env as CloudflareEnv, key) : null)
    for (const t of account ? missing : []) {
      const e = await fetchEvent(account!, t).catch(() => null)
      if (!e?.series_ticker) continue
      series.set(t, e.series_ticker)
      await db
        .insert(kalshiEvents)
        .values({
          eventTicker: t,
          seriesTicker: e.series_ticker,
          checkedAt: new Date(0).toISOString(),
        })
        .onConflictDoUpdate({
          target: kalshiEvents.eventTicker,
          set: { seriesTicker: e.series_ticker },
        })
    }
  }
  const legUrls: Record<string, string> = {}
  for (const t of tickers) {
    const s = series.get(t)
    if (s) legUrls[t] = eventUrl(s, t)
  }
  return {
    market:
      p.kind === 'single' && tickers[0] ? (legUrls[tickers[0]] ?? null) : null,
    portfolio: PORTFOLIO_URL,
    legs: legUrls,
  }
}
