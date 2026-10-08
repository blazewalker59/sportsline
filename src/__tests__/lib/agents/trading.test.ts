/**
 * Agent trading end to end (docs/adr/0008), on the real migrations: an
 * Agent proposes over /mcp, the Viewer approves, one order goes to Kalshi.
 * Kalshi, push and the key vault are stand-ins. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type { serveMcp as ServeMcp } from '@/lib/agents/endpoint'
import type * as Orders from '@/lib/kalshi/orders'
import type * as Trading from '@/lib/agents/trading'

const state = vi.hoisted(() => ({
  db: null as unknown,
  market: { status: 'active' } as Record<string, unknown> | null,
  placed: [] as Array<unknown>,
  pushes: [] as Array<string>,
}))
vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))
vi.mock('@/lib/ops/errors', () => ({ reportError: () => Promise.resolve() }))
vi.mock('@/lib/kalshi/account', () => ({
  loadAccount: () => Promise.resolve({ keyId: 'read-key', signer: {} }),
}))
vi.mock('@/lib/kalshi/vault', () => ({
  unseal: () => Promise.resolve('PEM'),
  seal: () => Promise.resolve({ ciphertext: 'c', iv: 'i' }),
}))
vi.mock('@/lib/kalshi/keys', () => ({
  importSigningKey: () => Promise.resolve({ type: 'ed25519' }),
}))
vi.mock('@/lib/kalshi/client', () => ({
  market: (_a: unknown, ticker: string) =>
    Promise.resolve(
      state.market && {
        ticker,
        title: 'Edmonton vs Anaheim',
        yes_sub_title: 'Edmonton',
        no_sub_title: 'Anaheim',
        yes_bid_dollars: '0.5300',
        yes_ask_dollars: '0.5400',
        ...state.market,
      },
    ),
}))
vi.mock('@/lib/kalshi/orders', async (original) => ({
  ...(await original<typeof Orders>()),
  placeOrder: (
    account: unknown,
    ticker: string,
    o: { count: number },
    id: string,
  ) => {
    state.placed.push({ account, ticker, o, id })
    return Promise.resolve({
      orderId: 'ord-1',
      filled: o.count,
      avgPrice: 0.53,
      fees: 0.2,
    })
  },
}))
vi.mock('@/lib/push/webpush', () => ({
  sendPush: (_s: unknown, message: string) => {
    state.pushes.push(message)
    return Promise.resolve('sent')
  },
}))

const URL_ = 'https://sportsline.dev/mcp'
const env = {
  DB: {},
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_JWK: '{}',
} as unknown as CloudflareEnv
const ORDER = {
  marketTicker: 'KXNHLGAME-26OCT07EDMANA-EDM',
  side: 'yes',
  action: 'buy',
  count: 10,
  limitCents: 54,
  note: 'Sharp pick #1, edge 2.5 points',
}

describe.skipIf(!isBun)('Agent trading', () => {
  let serveMcp: typeof ServeMcp
  let trading: typeof Trading
  let sqlite: { run: (sql: string) => void }
  let db: Db.Database
  let readToken = ''
  let tradeToken = ''
  let rpcId = 0

  async function call(token: string, method: string, params?: object) {
    const res = await serveMcp(
      new Request(URL_, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      }),
      env,
    )
    return (await res.json()) as {
      result?: {
        tools?: Array<{ name: string }>
        structuredContent?: Record<string, unknown>
        isError?: boolean
        content?: Array<{ text: string }>
      }
    }
  }
  const propose = (order: object = ORDER, token = tradeToken) =>
    call(token, 'tools/call', { name: 'propose_trade', arguments: order })

  beforeEach(async () => {
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite
    db = fresh.db as unknown as Db.Database
    state.db = db
    state.market = { status: 'active' }
    state.placed = []
    state.pushes = []
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','Viewer','v@example.com',1,0,0)",
    )
    sqlite.run(
      "INSERT INTO push_subscriptions (endpoint,viewer_id,p256dh,auth,created_at) VALUES ('https://push.example/1','u1','k','a','2026-10-07T00:00:00Z')",
    )
    sqlite.run(
      "INSERT INTO kalshi_trade_keys (viewer_id,key_id,key_type,key_ciphertext,key_iv,scopes,max_order_dollars,max_daily_dollars,connected_at) VALUES ('u1','trade-key','ed25519','c','i','[\"read\",\"write::trade\"]',25,40,'2026-10-07T00:00:00Z')",
    )
    const { createToken } = await import('@/lib/agents/tokens')
    readToken = (await createToken(db, 'u1', 'Reader')).token
    tradeToken = (await createToken(db, 'u1', 'Grok', ['read', 'trade'])).token
    ;({ serveMcp } = await import('@/lib/agents/endpoint'))
    trading = await import('@/lib/agents/trading')
  })

  it('offers the trading tools only to a token allowed to trade', async () => {
    const names = (r: Awaited<ReturnType<typeof call>>) =>
      r.result?.tools?.map((t) => t.name)
    expect(names(await call(readToken, 'tools/list'))).toEqual([
      'get_sharp_picks',
      'find_bet',
      'get_bet_record',
      'get_sharp_record',
    ])
    expect(names(await call(tradeToken, 'tools/list'))).toEqual([
      'get_sharp_picks',
      'find_bet',
      'get_bet_record',
      'get_sharp_record',
      'get_market',
      'propose_trade',
      'get_trades',
      'cancel_trade',
    ])
    const refused = await propose(ORDER, readToken)
    expect(refused).toMatchObject({ error: { code: -32602 } })
  })

  it('proposes, pushes the Viewer, and trades nothing until they approve', async () => {
    const r = await propose()
    expect(r.result?.isError).toBeUndefined()
    const proposal = r.result!.structuredContent!
    expect(proposal).toMatchObject({
      status: 'pending',
      order: 'Buy 10 YES at up to 54¢',
      market: 'Edmonton vs Anaheim · Edmonton',
      maxCostDollars: 5.6,
    })
    expect(state.placed).toHaveLength(0)
    expect(state.pushes).toHaveLength(1)
    expect(JSON.parse(state.pushes[0])).toMatchObject({
      title: 'Grok wants to trade',
      url: '/agents',
    })

    const approved = await trading.approveTrade(
      env,
      db,
      'u1',
      proposal.id as string,
    )
    expect(approved).toMatchObject({
      status: 'filled',
      orderId: 'ord-1',
      filledCount: 10,
      avgPriceDollars: 0.53,
    })
    // Placed once, with the trade key, the proposal id making it idempotent.
    expect(state.placed).toEqual([
      {
        account: { keyId: 'trade-key', signer: { type: 'ed25519' } },
        ticker: ORDER.marketTicker,
        o: expect.objectContaining({
          side: 'yes',
          action: 'buy',
          count: 10,
          limitCents: 54,
        }),
        id: proposal.id,
      },
    ])
    await expect(
      trading.approveTrade(env, db, 'u1', proposal.id as string),
    ).rejects.toThrow(/already been decided/)
    expect(state.placed).toHaveLength(1)

    const trades = await call(tradeToken, 'tools/call', {
      name: 'get_trades',
      arguments: {},
    })
    expect(trades.result?.structuredContent).toMatchObject({
      trades: [
        {
          id: proposal.id,
          status: 'filled',
          filledCount: 10,
          avgPriceCents: 53,
        },
      ],
    })
  })

  it('refuses orders over the limits, counting what was spent today', async () => {
    const big = await propose({ ...ORDER, count: 50 })
    expect(big.result).toMatchObject({ isError: true })
    expect(big.result?.content?.[0].text).toMatch(/limit per order/)

    // $40 a day. Each fill costs $5.50 (10 at 53¢ plus 20¢ fees) and each
    // proposal may cost $5.60: seven fit (6 × $5.50 + $5.60 = $38.60), the
    // eighth wouldn't ($38.50 + $5.60).
    for (let i = 0; i < 7; i++) {
      const p = await propose()
      expect(p.result?.structuredContent).toMatchObject({ status: 'pending' })
      await trading.approveTrade(
        env,
        db,
        'u1',
        p.result!.structuredContent!.id as string,
      )
    }
    const eighth = await propose()
    expect(eighth.result?.content?.[0].text).toMatch(
      /\$38\.50 has been spent today of the \$40\.00 daily limit/,
    )
    expect(state.placed).toHaveLength(7)
  })

  it("won't send a lapsed proposal, or one the Viewer rejected or the Agent withdrew", async () => {
    const p = (await propose()).result!.structuredContent!.id as string
    const later = new Date(Date.now() + trading.PROPOSAL_TTL_MS + 1)
    await expect(trading.approveTrade(env, db, 'u1', p, later)).rejects.toThrow(
      /expired/,
    )

    const q = (await propose()).result!.structuredContent!.id as string
    await trading.closeTrade(db, 'u1', q, 'rejected')
    await expect(trading.approveTrade(env, db, 'u1', q)).rejects.toThrow(
      /decided/,
    )

    const w = (await propose()).result!.structuredContent!.id as string
    const cancelled = await call(tradeToken, 'tools/call', {
      name: 'cancel_trade',
      arguments: { id: w },
    })
    expect(cancelled.result?.structuredContent).toMatchObject({
      status: 'cancelled',
    })
    await expect(trading.approveTrade(env, db, 'u1', w)).rejects.toThrow(
      /decided/,
    )
    expect(state.placed).toHaveLength(0)
  })

  it("won't propose on a market that isn't trading, or without a trade key", async () => {
    state.market = { status: 'closed' }
    expect((await propose()).result?.content?.[0].text).toMatch(/isn’t open/)
    state.market = { status: 'active' }
    sqlite.run("DELETE FROM kalshi_trade_keys WHERE viewer_id='u1'")
    expect((await propose()).result?.content?.[0].text).toMatch(/trade key/)
  })

  it("keeps one Viewer's proposals from another", async () => {
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u2','Other','o@example.com',1,0,0)",
    )
    const p = (await propose()).result!.structuredContent!.id as string
    await expect(trading.approveTrade(env, db, 'u2', p)).rejects.toThrow()
    expect(await trading.closeTrade(db, 'u2', p, 'rejected')).toBeNull()
    expect(state.placed).toHaveLength(0)
  })

  it('speaks in multipliers when the Viewer reads prices that way', async () => {
    sqlite.run(
      "INSERT INTO viewer_settings (viewer_id, price_display) VALUES ('u1','multiplier')",
    )
    const init = (await call(tradeToken, 'initialize', {
      protocolVersion: '2025-06-18',
    })) as { result?: { instructions?: string } }
    expect(init.result?.instructions).toMatch(/payout multipliers/)

    const { limitCents: _, ...byMultiplier } = ORDER
    const r = await propose({ ...byMultiplier, minMultiplier: 1.79 })
    // At least 1.79x after the fee: a 54¢ limit.
    expect(r.result?.structuredContent).toMatchObject({
      limitCents: 54,
      limitMultiplier: 1.79,
      order: 'Buy 10 YES paying 1.79x or more',
    })
    expect(JSON.parse(state.pushes.at(-1)!).body).toMatch(
      /paying 1\.79x or more/,
    )

    const sell = await propose({
      ...byMultiplier,
      action: 'sell',
      minMultiplier: 1.5,
    })
    expect(sell.result?.content?.[0].text).toMatch(/multiplier is for buying/)
    const neither = await propose(byMultiplier)
    expect(neither.result?.content?.[0].text).toMatch(/Give limitCents/)
  })
})
