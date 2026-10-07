import { generateKeyPairSync, verify } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { importSigningKey } from '@/lib/kalshi/keys'
import { bookOrder, maxCost, placeOrder } from '@/lib/kalshi/orders'
import { isReadOnly, isTradeOnly } from '@/lib/kalshi/scopes'

describe('bookOrder', () => {
  // Kalshi's V2 book is YES-only: bid buys YES, ask sells YES.
  it('buys YES as a bid at the price', () => {
    expect(bookOrder({ side: 'yes', action: 'buy', limitCents: 54 })).toEqual({
      bookSide: 'bid',
      price: '0.54',
    })
  })
  it('sells YES as an ask at the price', () => {
    expect(bookOrder({ side: 'yes', action: 'sell', limitCents: 61 })).toEqual({
      bookSide: 'ask',
      price: '0.61',
    })
  })
  it('buys NO by selling YES at the mirror price', () => {
    expect(bookOrder({ side: 'no', action: 'buy', limitCents: 40 })).toEqual({
      bookSide: 'ask',
      price: '0.60',
    })
  })
  it('sells NO by buying YES at the mirror price', () => {
    expect(bookOrder({ side: 'no', action: 'sell', limitCents: 40 })).toEqual({
      bookSide: 'bid',
      price: '0.60',
    })
  })
  it('keeps the edges of the book whole', () => {
    expect(bookOrder({ side: 'no', action: 'buy', limitCents: 1 }).price).toBe(
      '0.99',
    )
    expect(
      bookOrder({ side: 'yes', action: 'buy', limitCents: 99 }).price,
    ).toBe('0.99')
  })
})

describe('maxCost', () => {
  it('is contracts at the limit plus the fee, for a buy', () => {
    // 10 at 54¢: $5.40, plus ceil(7% × .54 × .46) = 2¢ each.
    expect(maxCost({ action: 'buy', count: 10, limitCents: 54 })).toBe(5.6)
  })
  it('is just the fee, for a sell', () => {
    expect(maxCost({ action: 'sell', count: 10, limitCents: 54 })).toBe(0.2)
  })
})

describe('trade key scopes', () => {
  it('accepts a key that can trade and read, nothing more', () => {
    expect(isTradeOnly(['read', 'write::trade'])).toBe(true)
    expect(isTradeOnly(['write::trade'])).toBe(true)
    expect(isTradeOnly(['read::portfolio_balance', 'write::trade'])).toBe(true)
  })
  it('refuses keys that can move money, or not trade at all', () => {
    expect(isTradeOnly(['read', 'write'])).toBe(false)
    expect(isTradeOnly(['read', 'write::trade', 'write::transfer'])).toBe(false)
    expect(isTradeOnly([])).toBe(false)
    expect(isTradeOnly(undefined)).toBe(false)
    expect(isTradeOnly(['read'])).toBe(false)
  })
  it('never counts a trade key as read-only', () => {
    expect(isReadOnly(['read', 'write::trade'])).toBe(false)
  })
})

describe('placeOrder', () => {
  afterEach(() => vi.unstubAllGlobals())

  async function account() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    return {
      account: { keyId: 'key-1', signer: await importSigningKey(privateKey) },
      publicKey,
    }
  }

  it('sends a signed, idempotent immediate-or-cancel limit order to the V2 endpoint', async () => {
    const { account: acct, publicKey } = await account()
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            order_id: 'ord-1',
            client_order_id: 'prop-1',
            fill_count: '6.00',
            remaining_count: '0.00',
            average_fill_price: '0.6000',
            average_fee_paid: '0.0200',
            ts_ms: 1,
          }),
          { status: 201 },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await placeOrder(
      acct,
      'KXNHLGAME-26OCT07EDMANA-EDM',
      { side: 'no', action: 'buy', count: 10, limitCents: 42 },
      'prop-1',
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://api.elections.kalshi.com/trade-api/v2/portfolio/events/orders',
    )
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      ticker: 'KXNHLGAME-26OCT07EDMANA-EDM',
      client_order_id: 'prop-1',
      side: 'ask',
      count: '10',
      price: '0.58',
      time_in_force: 'immediate_or_cancel',
      self_trade_prevention_type: 'taker_at_cross',
      reduce_only: false,
    })
    const headers = init.headers as Record<string, string>
    expect(headers['KALSHI-ACCESS-KEY']).toBe('key-1')
    const signed = `${headers['KALSHI-ACCESS-TIMESTAMP']}POST/trade-api/v2/portfolio/events/orders`
    expect(
      verify(
        null,
        Buffer.from(signed),
        publicKey,
        Buffer.from(headers['KALSHI-ACCESS-SIGNATURE'], 'base64'),
      ),
    ).toBe(true)
    // A NO buy filled at YES 60¢ cost 40¢ a contract.
    expect(result).toEqual({
      orderId: 'ord-1',
      filled: 6,
      avgPrice: 0.4,
      fees: 0.12,
    })
  })

  it('makes a sell reduce-only, and passes on why Kalshi refused an order', async () => {
    const { account: acct } = await account()
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(
        new Response('{"error":{"code":"insufficient_balance"}}', {
          status: 400,
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      placeOrder(
        acct,
        'T',
        { side: 'yes', action: 'sell', count: 2, limitCents: 70 },
        'p2',
      ),
    ).rejects.toThrow(/Kalshi 400.*insufficient_balance/)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject(
      {
        side: 'ask',
        price: '0.70',
        reduce_only: true,
      },
    )
    // Never retried: a lost reply could mean the order went through.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
