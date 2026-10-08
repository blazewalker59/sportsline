/**
 * A Viewer's API tokens for Agents (docs/adr/0007): list, create (the token
 * is shown once) and revoke. And trading (docs/adr/0008): the trade key,
 * its limits, and approving or rejecting what Agents propose.
 */

import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { approveTrade, closeTrade, expireTrades, recentTrades } from './trading'
import { SPENDING, spentOn, statusOf } from './proposal'
import { createToken } from './tokens'
import { CAP_LIMITS } from './caps'
import type { TradeProposal } from './proposal'
import type { TrendPickRow, TrendStats } from '@/lib/sharp/trendRecord'
import { KalshiError, apiKeys } from '@/lib/kalshi/client'
import { importSigningKey } from '@/lib/kalshi/keys'
import { isTradeOnly } from '@/lib/kalshi/scopes'
import { seal } from '@/lib/kalshi/vault'
import { getCloudflareEnv } from '@/lib/db'
import { apiTokens, kalshiTradeKeys, tradeProposals } from '@/lib/db/schema'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { withViewer } from '@/lib/viewer/session'
import { viewerTrendRecord } from '@/lib/sharp/trendRecord'

/** Enough for a few Agents; more is likely tokens nobody revoked. */
const MAX_ACTIVE_TOKENS = 10

export interface ApiTokenRow {
  id: string
  name: string
  prefix: string
  scopes: Array<string>
  createdAt: string
  lastUsedAt: string | null
}

/** Your tokens that still work, newest first. */
export const getApiTokens = createServerFn({ method: 'GET' }).handler(() =>
  withViewer(({ db, viewerId }): Promise<Array<ApiTokenRow>> =>
    db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        scopes: apiTokens.scopes,
        createdAt: apiTokens.createdAt,
        lastUsedAt: apiTokens.lastUsedAt,
      })
      .from(apiTokens)
      .where(and(eq(apiTokens.viewerId, viewerId), isNull(apiTokens.revokedAt)))
      .orderBy(desc(apiTokens.createdAt)),
  ),
)

/** A new token, returned this once and never again. */
export const createApiToken = createServerFn({ method: 'POST' })
  .validator((data: { name: string; trade?: boolean }) =>
    z
      .object({
        name: z.string().trim().min(1).max(60),
        trade: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }) => {
      const active = await db
        .select({ id: apiTokens.id })
        .from(apiTokens)
        .where(
          and(eq(apiTokens.viewerId, viewerId), isNull(apiTokens.revokedAt)),
        )
      if (active.length >= MAX_ACTIVE_TOKENS) {
        throw new Error(
          `You have ${MAX_ACTIVE_TOKENS} tokens: revoke one to make another`,
        )
      }
      return createToken(
        db,
        viewerId,
        data.name,
        data.trade ? ['read', 'trade'] : ['read'],
      )
    }),
  )

/** Stop a token working, at once. */
export const revokeApiToken = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) =>
    z.object({ id: z.string().min(1).max(64) }).parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }) => {
      await db
        .update(apiTokens)
        .set({ revokedAt: new Date().toISOString() })
        .where(and(eq(apiTokens.id, data.id), eq(apiTokens.viewerId, viewerId)))
    }),
  )

// ─── Trading (docs/adr/0008) ────────────────────────────────────────────────

export type TradeView = TradeProposal

export interface TradingState {
  key: {
    keyId: string
    maxOrderDollars: number
    maxDailyDollars: number
    connectedAt: string
  } | null
  spentToday: number
  /** Pending first, then the rest, newest first. */
  trades: Array<TradeView>
}

export const getTrading = createServerFn({ method: 'GET' }).handler(() =>
  withViewer(async ({ db, viewerId }): Promise<TradingState> => {
    await expireTrades(db, viewerId)
    const key = await db
      .select()
      .from(kalshiTradeKeys)
      .where(eq(kalshiTradeKeys.viewerId, viewerId))
      .get()
    const now = Date.now()
    const today = sportsDayOf(new Date())
    const trades = (await recentTrades(db, viewerId, 30)).map((p) => ({
      ...p,
      status: statusOf(p, now),
    }))
    return {
      key: key
        ? {
            keyId: key.keyId,
            maxOrderDollars: key.maxOrderDollars,
            maxDailyDollars: key.maxDailyDollars,
            connectedAt: key.connectedAt,
          }
        : null,
      spentToday: trades
        .filter((t) => t.approvedDay === today && SPENDING.includes(t.status))
        .reduce((n, t) => n + spentOn(t), 0),
      trades: [
        ...trades.filter((t) => t.status === 'pending'),
        ...trades.filter((t) => t.status !== 'pending'),
      ],
    }
  }),
)

const Caps = z.object({
  maxOrderDollars: z.number().min(1).max(CAP_LIMITS.maxOrderDollars),
  maxDailyDollars: z.number().min(1).max(CAP_LIMITS.maxDailyDollars),
})

/**
 * Connect a Kalshi key for trading: it must sign a request Kalshi accepts,
 * and Kalshi must list it as able to trade but not move money.
 */
export const connectTradeKey = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      keyId: string
      privateKey: string
      maxOrderDollars: number
      maxDailyDollars: number
    }) =>
      Caps.extend({
        keyId: z.string().trim().min(8).max(100),
        privateKey: z.string().min(64).max(10_000),
      }).parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }) => {
      const env = getCloudflareEnv()
      let signer
      try {
        signer = await importSigningKey(data.privateKey)
      } catch {
        throw new Error(
          'That isn’t a private key Kalshi issues. Paste the whole key, including its BEGIN and END lines.',
        )
      }
      let keys
      try {
        keys = await apiKeys({ keyId: data.keyId, signer })
      } catch (error) {
        if (
          error instanceof KalshiError &&
          (error.status === 401 || error.status === 403)
        ) {
          throw new Error(
            'Kalshi didn’t accept this key. Check the key ID matches the private key, and that the key has the Read scope.',
          )
        }
        throw new Error('Couldn’t reach Kalshi to check the key. Try again.')
      }
      const key = keys.find((k) => k.api_key_id === data.keyId)
      if (!isTradeOnly(key?.scopes)) {
        throw new Error(
          'Sportsline needs a key with exactly the Read and Trade scopes: one that can trade but never withdraw or transfer money. Create one in Kalshi with only those.',
        )
      }
      const sealed = await seal(env.KALSHI_ENCRYPTION_KEY, data.privateKey)
      const row = {
        viewerId,
        keyId: data.keyId,
        keyType: signer.type,
        keyCiphertext: sealed.ciphertext,
        keyIv: sealed.iv,
        scopes: key!.scopes!,
        maxOrderDollars: data.maxOrderDollars,
        maxDailyDollars: Math.max(data.maxDailyDollars, data.maxOrderDollars),
        connectedAt: new Date().toISOString(),
      }
      await db
        .insert(kalshiTradeKeys)
        .values(row)
        .onConflictDoUpdate({ target: kalshiTradeKeys.viewerId, set: row })
    }),
  )

export const setTradeCaps = createServerFn({ method: 'POST' })
  .validator((data: { maxOrderDollars: number; maxDailyDollars: number }) =>
    Caps.parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }) => {
      await db
        .update(kalshiTradeKeys)
        .set({
          maxOrderDollars: data.maxOrderDollars,
          maxDailyDollars: Math.max(data.maxDailyDollars, data.maxOrderDollars),
        })
        .where(eq(kalshiTradeKeys.viewerId, viewerId))
    }),
  )

/** Forget the trade key; anything waiting on the Viewer is rejected. */
export const disconnectTradeKey = createServerFn({ method: 'POST' }).handler(
  () =>
    withViewer(async ({ db, viewerId }) => {
      await db
        .update(tradeProposals)
        .set({ status: 'rejected', decidedAt: new Date().toISOString() })
        .where(
          and(
            eq(tradeProposals.viewerId, viewerId),
            eq(tradeProposals.status, 'pending'),
          ),
        )
      await db
        .delete(kalshiTradeKeys)
        .where(eq(kalshiTradeKeys.viewerId, viewerId))
    }),
)

const ProposalId = z.object({ id: z.string().min(1).max(64) })

/** Approve an Agent's proposal: the order is sent to Kalshi now. */
export const approveTradeProposal = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => ProposalId.parse(data))
  .handler(({ data }) =>
    withViewer(({ db, viewerId }) =>
      approveTrade(getCloudflareEnv(), db, viewerId, data.id),
    ),
  )

export const rejectTradeProposal = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => ProposalId.parse(data))
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }) => {
      await closeTrade(db, viewerId, data.id, 'rejected')
    }),
  )

// ─── find_bet record (docs/adr/0009) ────────────────────────────────────────

export interface BetRecordView {
  stats: TrendStats
  recent: Array<TrendPickRow>
}

/** What came of find_bet's picks: placed or not, and how they did. */
export const getBetRecord = createServerFn({ method: 'GET' }).handler(() =>
  withViewer(async ({ db, viewerId }): Promise<BetRecordView> => {
    const { stats, picks } = await viewerTrendRecord(db, viewerId)
    return {
      stats,
      recent: [...picks]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 15),
    }
  }),
)
