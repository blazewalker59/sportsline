/**
 * Cashing out (docs/adr/0012) on the real migrations: a single's reduce-
 * only order, a Combo's quote, settling what's left in flight, and Open in
 * Kalshi's links. Kalshi and the key vault are stand-ins. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type * as KalshiClient from '@/lib/kalshi/client'
import type * as Orders from '@/lib/kalshi/orders'
import type * as Run from '@/lib/kalshi/cashOutRun'

const state = vi.hoisted(() => ({
  db: null as unknown,
  market: {} as Record<string, unknown> | null,
  /** Kalshi's signed position in the market (positive YES, negative NO). */
  position: 120,
  placed: [] as Array<{
    ticker: string
    o: Record<string, unknown>
    id: string
  }>,
  placeError: null as Error | null,
  posts: [] as Array<{ path: string; body: unknown }>,
  puts: [] as Array<{ path: string; body: unknown }>,
  deletes: [] as Array<string>,
  /** What creating an RFQ throws, once. */
  rfqError: null as Error | null,
  ownRfqs: [] as Array<Record<string, unknown>>,
  quotes: [] as Array<Record<string, unknown>>,
  /** The accepted quote as Kalshi reports it afterwards. */
  quote: null as Record<string, unknown> | null,
  orders: [] as Array<Record<string, unknown>>,
  fills: [] as Array<Record<string, unknown>>,
  events: {} as Record<string, string>,
  eventReads: [] as Array<string>,
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
  isLegacy: () => false,
  seal: () => Promise.resolve({ ciphertext: 'c', iv: 'i' }),
}))
vi.mock('@/lib/kalshi/keys', () => ({
  importSigningKey: () => Promise.resolve({ type: 'ed25519' }),
}))
vi.mock('@/lib/kalshi/client', async (original) => {
  const { KalshiError } = await original<typeof KalshiClient>()
  return {
    KalshiError,
    market: (_a: unknown, ticker: string) =>
      Promise.resolve(
        state.market && {
          ticker,
          status: 'active',
          yes_bid_dollars: '0.6100',
          yes_ask_dollars: '0.6300',
          no_bid_dollars: '0.3700',
          ...state.market,
        },
      ),
    positionIn: () => Promise.resolve(state.position),
    event: (_a: unknown, t: string) => {
      state.eventReads.push(t)
      return Promise.resolve(
        state.events[t]
          ? { event_ticker: t, series_ticker: state.events[t] }
          : null,
      )
    },
    signedGet: (_a: unknown, path: string) => {
      if (path.startsWith('/communications/rfqs?'))
        return Promise.resolve({ rfqs: state.ownRfqs })
      if (path.startsWith('/communications/quotes?'))
        return Promise.resolve({ quotes: state.quotes })
      if (path.startsWith('/communications/rfqs/'))
        return Promise.resolve({ quote: state.quote })
      if (path.startsWith('/portfolio/orders'))
        return Promise.resolve({ orders: state.orders })
      return Promise.resolve({ fills: state.fills })
    },
    signedPost: (_a: unknown, path: string, body: unknown) => {
      state.posts.push({ path, body })
      if (state.rfqError) {
        const e = state.rfqError
        state.rfqError = null
        return Promise.reject(e)
      }
      return Promise.resolve({ id: 'rfq-1' })
    },
    signedPut: (_a: unknown, path: string, body: unknown) => {
      state.puts.push({ path, body })
      return Promise.resolve({})
    },
    signedDelete: (_a: unknown, path: string) => {
      state.deletes.push(path)
      return Promise.resolve({})
    },
  }
})
vi.mock('@/lib/kalshi/orders', async (original) => ({
  ...(await original<typeof Orders>()),
  placeOrder: (
    _account: unknown,
    ticker: string,
    o: { count: number },
    id: string,
  ) => {
    state.placed.push({ ticker, o, id })
    if (state.placeError) return Promise.reject(state.placeError)
    return Promise.resolve({
      orderId: 'ord-1',
      filled: o.count,
      avgPrice: 0.6,
      fees: 2.02,
    })
  },
}))

const env = { DB: {}, KALSHI_ENCRYPTION_KEY: 'k' } as never
const SINGLE = 'KXNFLGAME-26NOV26KCBUF-KC'
const COMBO = 'KXMVENFLSGL-26NOV26-ABC'
const NOW = new Date('2026-11-26T22:00:00Z')
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

describe.skipIf(!isBun)('cash out', () => {
  let run: typeof Run
  let sqlite: {
    run: (sql: string) => void
    query: (s: string) => { all: () => Array<Record<string, unknown>> }
  }
  const rows = () =>
    sqlite.query('SELECT * FROM cash_outs ORDER BY created_at').all()

  beforeEach(async () => {
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite as never
    state.db = fresh.db
    Object.assign(state, {
      market: {},
      position: 120,
      placed: [],
      placeError: null,
      posts: [],
      puts: [],
      deletes: [],
      rfqError: null,
      ownRfqs: [],
      quotes: [],
      quote: null,
      orders: [],
      fills: [],
      events: {},
      eventReads: [],
    })
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','Viewer','v@example.com',1,0,0)",
    )
    sqlite.run(
      "INSERT INTO kalshi_trade_keys (viewer_id,key_id,key_type,key_ciphertext,key_iv,scopes,max_order_dollars,max_daily_dollars,connected_at) VALUES ('u1','trade-key','ed25519','c','i','[\"read\",\"write::trade\"]',25,40,'2026-11-01T00:00:00Z')",
    )
    sqlite.run(
      `INSERT INTO predictions (id,viewer_id,market_ticker,kind,side,title,contracts,cost,status,opened_at,updated_at) VALUES ('p1','u1','${SINGLE}','single','yes','Chiefs to win',120,62.4,'open','2026-11-26T20:00:00Z','2026-11-26T20:00:00Z'), ('p2','u1','${COMBO}','combo','yes','Kelce 60+ · Over 47.5',20,2.6,'open','2026-11-26T20:00:00Z','2026-11-26T20:00:00Z')`,
    )
    sqlite.run(
      `INSERT INTO prediction_legs (prediction_id,position,market_ticker,event_ticker,side,title) VALUES ('p1',0,'${SINGLE}','KXNFLGAME-26NOV26KCBUF','yes','Chiefs to win'), ('p2',0,'KXNFLRECYDS-26NOV26KCBUF-KC-60','KXNFLRECYDS-26NOV26KCBUF','yes','Kelce 60+'), ('p2',1,'KXNFLTOTAL-26NOV26KCBUF-47','KXNFLTOTAL-26NOV26KCBUF','yes','Over 47.5')`,
    )
    run = await import('@/lib/kalshi/cashOutRun')
  })

  describe('a single', () => {
    it('previews the price and the order’s worst price, 2¢ under', async () => {
      const p = await run.previewCashOut(env, 'u1', 'p1')
      expect(p).toMatchObject({
        kind: 'single',
        held: 120,
        trading: true,
        single: { open: true, cents: 61, limitCents: 59 },
      })
    })

    it('sells with one reduce-only sell order, recorded once', async () => {
      const v = await run.sellSingle(
        env,
        'u1',
        { predictionId: 'p1', id: id(1), count: 120, limitCents: 59 },
        NOW,
      )
      expect(state.placed).toEqual([
        {
          ticker: SINGLE,
          o: { side: 'yes', action: 'sell', count: 120, limitCents: 59 },
          id: id(1),
        },
      ])
      expect(v).toMatchObject({
        status: 'filled',
        filledCount: 120,
        avgPriceDollars: 0.6,
      })
      await expect(
        run.sellSingle(
          env,
          'u1',
          { predictionId: 'p1', id: id(1), count: 120, limitCents: 59 },
          NOW,
        ),
      ).rejects.toThrow('already sent')
      expect(state.placed).toHaveLength(1)
    })

    it('sells part of a position, never more than held', async () => {
      await run.sellSingle(
        env,
        'u1',
        { predictionId: 'p1', id: id(1), count: 50, limitCents: 59 },
        NOW,
      )
      expect(state.placed[0].o).toMatchObject({ count: 50 })
      await expect(
        run.sellSingle(
          env,
          'u1',
          { predictionId: 'p1', id: id(2), count: 121, limitCents: 59 },
          NOW,
        ),
      ).rejects.toThrow('up to 120')
    })

    it('refuses a worst price far under the market’s (the price moved)', async () => {
      await expect(
        run.sellSingle(
          env,
          'u1',
          { predictionId: 'p1', id: id(1), count: 120, limitCents: 50 },
          NOW,
        ),
      ).rejects.toThrow('price has moved')
      expect(state.placed).toHaveLength(0)
    })

    it('needs a trade key', async () => {
      sqlite.run('DELETE FROM kalshi_trade_keys')
      expect((await run.previewCashOut(env, 'u1', 'p1')).trading).toBe(false)
      await expect(
        run.sellSingle(
          env,
          'u1',
          { predictionId: 'p1', id: id(1), count: 120, limitCents: 59 },
          NOW,
        ),
      ).rejects.toThrow('trade key')
    })

    it('records a refusal as failed, a lost reply as unknown', async () => {
      const { KalshiError } = await import('@/lib/kalshi/client')
      state.placeError = new KalshiError(400, 'Kalshi 400: insufficient')
      expect(
        (
          await run.sellSingle(
            env,
            'u1',
            { predictionId: 'p1', id: id(1), count: 10, limitCents: 59 },
            NOW,
          )
        ).status,
      ).toBe('failed')
      state.placeError = new Error('timeout')
      expect(
        (
          await run.sellSingle(
            env,
            'u1',
            { predictionId: 'p1', id: id(2), count: 10, limitCents: 59 },
            NOW,
          )
        ).status,
      ).toBe('unknown')
    })
  })

  describe('a Combo', () => {
    it('asks for a quote on the contracts held, nothing resting', async () => {
      const v = await run.requestQuote(
        env,
        'u1',
        { predictionId: 'p2', id: id(1), count: 20 },
        NOW,
      )
      expect(v.status).toBe('quoting')
      expect(state.posts).toEqual([
        {
          path: '/communications/rfqs',
          body: {
            market_ticker: COMBO,
            contracts_fp: '20.00',
            rest_remainder: false,
            obscure_creator_id: true,
          },
        },
      ])
    })

    it('won’t ask to sell more than Kalshi shows held', async () => {
      state.position = 10
      await expect(
        run.requestQuote(
          env,
          'u1',
          { predictionId: 'p2', id: id(1), count: 20 },
          NOW,
        ),
      ).rejects.toThrow('up to 10')
      expect(state.posts).toHaveLength(0)
    })

    it('replaces our own open request on the market', async () => {
      const { KalshiError } = await import('@/lib/kalshi/client')
      state.rfqError = new KalshiError(409, 'already_exists')
      state.ownRfqs = [{ id: 'old-rfq', market_ticker: COMBO }]
      const v = await run.requestQuote(
        env,
        'u1',
        { predictionId: 'p2', id: id(1), count: 20 },
        NOW,
      )
      expect(state.deletes).toEqual(['/communications/rfqs/old-rfq'])
      expect(state.posts).toHaveLength(2)
      expect(v.status).toBe('quoting')
    })

    it('shows the best quote for the side held, with fees', async () => {
      await run.requestQuote(
        env,
        'u1',
        { predictionId: 'p2', id: id(1), count: 20 },
        NOW,
      )
      state.quotes = [
        {
          id: 'q1',
          yes_bid_dollars: '0.300',
          no_bid_dollars: '0.650',
          status: 'open',
        },
        {
          id: 'q2',
          yes_bid_dollars: '0.312',
          no_bid_dollars: '0.600',
          status: 'open',
        },
      ]
      const v = await run.readCashOut(env, 'u1', id(1), NOW)
      expect(v.quote).toEqual({
        id: 'q2',
        price: 0.312,
        gross: 6.24,
        fees: 0.31,
        net: 5.93,
      })
    })

    it('accepts the NO side to sell YES, and records the fills', async () => {
      await run.requestQuote(
        env,
        'u1',
        { predictionId: 'p2', id: id(1), count: 20 },
        NOW,
      )
      state.quotes = [
        {
          id: 'q2',
          yes_bid_dollars: '0.312',
          no_bid_dollars: '0.600',
          status: 'open',
        },
      ]
      state.quote = {
        id: 'q2',
        status: 'executed',
        rfq_creator_order_id: 'ord-9',
      }
      state.fills = [
        {
          order_id: 'ord-9',
          count_fp: '20.00',
          yes_price_dollars: '0.3120',
          fee_cost: '0.31',
        },
      ]
      const v = await run.acceptQuote(
        env,
        'u1',
        { id: id(1), quoteId: 'q2', price: 0.312 },
        NOW,
      )
      expect(state.puts).toEqual([
        {
          path: '/communications/rfqs/rfq-1/quotes/q2/accept',
          body: { accepted_side: 'no' },
        },
      ])
      expect(v).toMatchObject({
        status: 'filled',
        filledCount: 20,
        avgPriceDollars: 0.312,
        feesDollars: 0.31,
      })
    })

    it('accepts nothing if the position shrank, or the price dropped', async () => {
      await run.requestQuote(
        env,
        'u1',
        { predictionId: 'p2', id: id(1), count: 20 },
        NOW,
      )
      state.quotes = [{ id: 'q2', yes_bid_dollars: '0.290', status: 'open' }]
      await expect(
        run.acceptQuote(
          env,
          'u1',
          { id: id(1), quoteId: 'q2', price: 0.312 },
          NOW,
        ),
      ).rejects.toThrow('withdrawn')
      state.position = 5
      await expect(
        run.acceptQuote(
          env,
          'u1',
          { id: id(1), quoteId: 'q2', price: 0.29 },
          NOW,
        ),
      ).rejects.toThrow('fewer contracts')
      expect(state.puts).toHaveLength(0)
    })

    it('says nothing was sold when the maker doesn’t confirm', async () => {
      await run.requestQuote(
        env,
        'u1',
        { predictionId: 'p2', id: id(1), count: 20 },
        NOW,
      )
      state.quotes = [{ id: 'q2', yes_bid_dollars: '0.312', status: 'open' }]
      state.quote = { id: 'q2', status: 'cancelled' }
      const v = await run.acceptQuote(
        env,
        'u1',
        { id: id(1), quoteId: 'q2', price: 0.312 },
        NOW,
      )
      expect(v.status).toBe('unfilled')
    })

    it('closes the request when the Viewer leaves', async () => {
      await run.requestQuote(
        env,
        'u1',
        { predictionId: 'p2', id: id(1), count: 20 },
        NOW,
      )
      const v = await run.dropQuote(env, 'u1', id(1), NOW)
      expect(v.status).toBe('expired')
      expect(state.deletes).toEqual(['/communications/rfqs/rfq-1'])
    })
  })

  describe('settling what’s in flight', () => {
    it('looks up an order whose reply was lost, by its client order id', async () => {
      state.placeError = new Error('timeout')
      await run.sellSingle(
        env,
        'u1',
        { predictionId: 'p1', id: id(1), count: 120, limitCents: 59 },
        NOW,
      )
      state.orders = [
        {
          order_id: 'ord-1',
          client_order_id: id(1),
          status: 'executed',
          fill_count_fp: '100.00',
        },
      ]
      state.fills = [
        {
          order_id: 'ord-1',
          count_fp: '100.00',
          yes_price_dollars: '0.6000',
          fee_cost: '1.68',
        },
      ]
      const later = new Date(NOW.getTime() + 4 * 60_000)
      expect(await run.reconcileCashOuts(env, 'u1', later)).toBe(1)
      expect(rows()[0]).toMatchObject({
        status: 'partial',
        filled_count: 100,
        order_id: 'ord-1',
      })
    })

    it('drops a quote request left open', async () => {
      await run.requestQuote(
        env,
        'u1',
        { predictionId: 'p2', id: id(1), count: 20 },
        NOW,
      )
      await run.reconcileCashOuts(
        env,
        'u1',
        new Date(NOW.getTime() + 6 * 60_000),
      )
      expect(rows()[0]).toMatchObject({ status: 'expired' })
    })
  })

  describe('Open in Kalshi', () => {
    it('links a single to its event, reading the series once', async () => {
      state.events = { 'KXNFLGAME-26NOV26KCBUF': 'KXNFLGAME' }
      const links = await run.kalshiLinks(env, 'u1', 'p1')
      expect(links?.market).toBe(
        'https://kalshi.com/markets/kxnflgame/kxnflgame-26nov26kcbuf',
      )
      await run.kalshiLinks(env, 'u1', 'p1')
      expect(state.eventReads).toEqual(['KXNFLGAME-26NOV26KCBUF'])
    })

    it('links a Combo to the portfolio, and each Leg to its event', async () => {
      state.events = {
        'KXNFLRECYDS-26NOV26KCBUF': 'KXNFLRECYDS',
        'KXNFLTOTAL-26NOV26KCBUF': 'KXNFLTOTAL',
      }
      const links = await run.kalshiLinks(env, 'u1', 'p2')
      expect(links).toMatchObject({
        market: null,
        portfolio: 'https://kalshi.com/portfolio',
        legs: {
          'KXNFLRECYDS-26NOV26KCBUF':
            'https://kalshi.com/markets/kxnflrecyds/kxnflrecyds-26nov26kcbuf',
          'KXNFLTOTAL-26NOV26KCBUF':
            'https://kalshi.com/markets/kxnfltotal/kxnfltotal-26nov26kcbuf',
        },
      })
    })
  })
})
