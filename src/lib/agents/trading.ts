/**
 * Agents' Kalshi orders (docs/adr/0008). An Agent with a `trade` token
 * proposes an order; the Viewer is pushed an Alert and approves or rejects
 * it in Sportsline; only an approved order, within the Viewer's per-order
 * and daily caps, is sent to Kalshi, with the Viewer's trade key.
 */

import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm'
import { SPENDING, capProblem, describeOrder, spentOn } from './proposal'
import type { TradeProposal } from './proposal'
import type { Caller } from './tokens'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { OrderIntent } from '@/lib/kalshi/orders'
import { loadAccount } from '@/lib/kalshi/account'
import { market as fetchMarket } from '@/lib/kalshi/client'
import { importSigningKey } from '@/lib/kalshi/keys'
import { maxCost, placeOrder } from '@/lib/kalshi/orders'
import { unseal } from '@/lib/kalshi/vault'
import {
  kalshiTradeKeys,
  pushSubscriptions,
  tradeProposals,
} from '@/lib/db/schema'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { reportError } from '@/lib/ops/errors'
import { vapidKeys } from '@/lib/push/deliver'
import { sendPush } from '@/lib/push/webpush'

/** Prices move: a proposal not decided in this long lapses. */
export const PROPOSAL_TTL_MS = 10 * 60_000
/** Proposals waiting at once, per Viewer, so an Agent can't flood them. */
const MAX_PENDING = 5

async function spentToday(
  db: Database,
  viewerId: string,
  day: string,
): Promise<number> {
  const rows = await db
    .select()
    .from(tradeProposals)
    .where(
      and(
        eq(tradeProposals.viewerId, viewerId),
        eq(tradeProposals.approvedDay, day),
        inArray(tradeProposals.status, SPENDING),
      ),
    )
  return rows.reduce((n, p) => n + spentOn(p), 0)
}

export async function tradeKeyRow(db: Database, viewerId: string) {
  return db
    .select()
    .from(kalshiTradeKeys)
    .where(eq(kalshiTradeKeys.viewerId, viewerId))
    .get()
}

export interface ProposeInput extends OrderIntent {
  marketTicker: string
  note?: string
}

/** An Agent proposes an order; the Viewer is asked to approve it. */
export async function proposeTrade(
  env: CloudflareEnv,
  db: Database,
  caller: Caller,
  input: ProposeInput,
  now = new Date(),
): Promise<TradeProposal> {
  const key = await tradeKeyRow(db, caller.viewerId)
  if (!key) {
    throw new Error(
      'Trading isn’t set up: the Viewer needs to connect a Kalshi trade key on Sportsline’s Agents page.',
    )
  }
  const pending = await db
    .select({ n: sql<number>`count(*)` })
    .from(tradeProposals)
    .where(
      and(
        eq(tradeProposals.viewerId, caller.viewerId),
        eq(tradeProposals.status, 'pending'),
        gt(tradeProposals.expiresAt, now.toISOString()),
      ),
    )
    .get()
  if ((pending?.n ?? 0) >= MAX_PENDING) {
    throw new Error(
      `${MAX_PENDING} proposals are already waiting for the Viewer. Wait for them to be decided, or cancel one.`,
    )
  }

  // The market must exist and be trading (read with the Viewer's read key,
  // or the trade key if they have none).
  const reader =
    (await loadAccount(env, caller.viewerId)) ?? (await tradeAccount(env, key))
  const m = await fetchMarket(reader, input.marketTicker).catch(() => null)
  if (!m) throw new Error(`No Kalshi market ${input.marketTicker}.`)
  if (m.status !== 'active') {
    throw new Error(
      `Kalshi market ${input.marketTicker} isn’t open for trading (${m.status ?? 'unknown status'}).`,
    )
  }

  const cost = maxCost(input)
  const problem = capProblem(
    cost,
    key,
    await spentToday(db, caller.viewerId, sportsDayOf(now)),
  )
  if (problem) throw new Error(problem)

  const row: TradeProposal = {
    id: crypto.randomUUID(),
    viewerId: caller.viewerId,
    tokenId: caller.tokenId,
    agentName: caller.agentName,
    marketTicker: input.marketTicker,
    marketTitle: marketTitle(m, input.side),
    side: input.side,
    action: input.action,
    count: input.count,
    limitCents: input.limitCents,
    maxCostDollars: cost,
    note: input.note?.trim() || null,
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
    decidedAt: null,
    approvedDay: null,
    orderId: null,
    filledCount: null,
    avgPriceDollars: null,
    feesDollars: null,
    error: null,
  }
  await db.insert(tradeProposals).values(row)
  await notifyProposal(env, db, row).catch((error: unknown) =>
    reportError(env, 'trading', error, { step: 'notify', id: row.id }),
  )
  return row
}

function marketTitle(
  m: { title?: string; yes_sub_title?: string; no_sub_title?: string },
  side: 'yes' | 'no',
): string {
  const sub = side === 'yes' ? m.yes_sub_title : m.no_sub_title
  return [m.title, sub].filter(Boolean).join(' · ') || 'Kalshi market'
}

async function tradeAccount(
  env: CloudflareEnv,
  key: typeof kalshiTradeKeys.$inferSelect,
) {
  const pem = await unseal(env.KALSHI_ENCRYPTION_KEY, {
    ciphertext: key.keyCiphertext,
    iv: key.keyIv,
  })
  return { keyId: key.keyId, signer: await importSigningKey(pem) }
}

/** Push the Viewer's devices: an Agent is waiting on them. */
async function notifyProposal(
  env: CloudflareEnv,
  db: Database,
  p: TradeProposal,
): Promise<void> {
  const keys = vapidKeys(env)
  if (!keys) return
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.viewerId, p.viewerId))
  const message = JSON.stringify({
    title: `${p.agentName} wants to trade`,
    body: `${describeOrder(p)}: ${p.marketTitle}. Up to $${p.maxCostDollars.toFixed(2)}. Approve within 10 minutes.`,
    url: '/agents',
    tag: `trade-${p.id}`,
  })
  await Promise.allSettled(
    subs.map((s) => sendPush(s, message, keys, { ttlSeconds: 600 })),
  )
}

/**
 * The Viewer approves: claim the proposal (once, while it's live), check
 * the caps again, and send the order with their trade key.
 */
export async function approveTrade(
  env: CloudflareEnv,
  db: Database,
  viewerId: string,
  id: string,
  now = new Date(),
): Promise<TradeProposal> {
  const key = await tradeKeyRow(db, viewerId)
  if (!key) throw new Error('Connect a Kalshi trade key first.')
  const day = sportsDayOf(now)
  // One click wins: only a live, pending proposal moves to placing.
  const [claimed] = await db
    .update(tradeProposals)
    .set({ status: 'placing', decidedAt: now.toISOString(), approvedDay: day })
    .where(
      and(
        eq(tradeProposals.id, id),
        eq(tradeProposals.viewerId, viewerId),
        eq(tradeProposals.status, 'pending'),
        gt(tradeProposals.expiresAt, now.toISOString()),
      ),
    )
    .returning()
  if (!claimed) {
    throw new Error('This proposal has already been decided, or has expired.')
  }

  const finish = async (set: Partial<TradeProposal>) => {
    const [row] = await db
      .update(tradeProposals)
      .set(set)
      .where(eq(tradeProposals.id, id))
      .returning()
    return row
  }

  // Today's spending, not counting this order.
  const spent = (await spentToday(db, viewerId, day)) - spentOn(claimed)
  const problem = capProblem(claimed.maxCostDollars, key, spent)
  if (problem) return finish({ status: 'failed', error: problem })

  try {
    const result = await placeOrder(
      await tradeAccount(env, key),
      claimed.marketTicker,
      claimed,
      claimed.id,
    )
    return finish({
      status:
        result.filled === 0
          ? 'unfilled'
          : result.filled < claimed.count
            ? 'partial'
            : 'filled',
      orderId: result.orderId,
      filledCount: result.filled,
      avgPriceDollars: result.avgPrice,
      feesDollars: result.fees,
    })
  } catch (error) {
    await reportError(env, 'trading', error, { step: 'place', id })
    return finish({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/** The Viewer says no, or the Agent withdraws: only while it's pending. */
export async function closeTrade(
  db: Database,
  viewerId: string,
  id: string,
  status: 'rejected' | 'cancelled',
  now = new Date(),
): Promise<TradeProposal | null> {
  const [row] = await db
    .update(tradeProposals)
    .set({ status, decidedAt: now.toISOString() })
    .where(
      and(
        eq(tradeProposals.id, id),
        eq(tradeProposals.viewerId, viewerId),
        eq(tradeProposals.status, 'pending'),
      ),
    )
    .returning()
  return row ?? null
}

/** A Viewer's proposals, newest first. */
export function recentTrades(db: Database, viewerId: string, limit = 20) {
  return db
    .select()
    .from(tradeProposals)
    .where(eq(tradeProposals.viewerId, viewerId))
    .orderBy(desc(tradeProposals.createdAt))
    .limit(limit)
}

/** Proposals waiting on the Viewer right now. */
export function pendingTrades(
  db: Database,
  viewerId: string,
  now = new Date(),
) {
  return db
    .select()
    .from(tradeProposals)
    .where(
      and(
        eq(tradeProposals.viewerId, viewerId),
        eq(tradeProposals.status, 'pending'),
        gt(tradeProposals.expiresAt, now.toISOString()),
      ),
    )
    .orderBy(desc(tradeProposals.createdAt))
}

/** Mark lapsed proposals expired, so the record reads true. */
export async function expireTrades(
  db: Database,
  viewerId: string,
  now = new Date(),
): Promise<void> {
  await db
    .update(tradeProposals)
    .set({ status: 'expired' })
    .where(
      and(
        eq(tradeProposals.viewerId, viewerId),
        eq(tradeProposals.status, 'pending'),
        lte(tradeProposals.expiresAt, now.toISOString()),
      ),
    )
}
