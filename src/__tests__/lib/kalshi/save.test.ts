/**
 * Saving a Prediction with its Legs: one batch, Legs past the end dropped,
 * lookups run side by side. Matching and the API are stand-ins; rows land
 * in the real migrations. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { KalshiAccount, KalshiMarket } from '@/lib/kalshi/client'
import type * as KalshiClient from '@/lib/kalshi/client'
import type * as Save from '@/lib/kalshi/save'

const state = vi.hoisted(() => ({
  markets: {} as Record<string, Record<string, unknown>>,
  lookups: [] as Array<string>,
  pending: 0,
  overlapped: false,
  failOn: null as string | null,
}))

vi.mock('@/lib/kalshi/client', async (original) => ({
  ...(await original<typeof KalshiClient>()),
  markets: (_account: unknown, tickers: Array<string>) =>
    Promise.resolve(tickers.flatMap((t) => state.markets[t] ?? [])),
}))

vi.mock('@/lib/kalshi/matching', () => ({
  gameFor: async (
    _env: unknown,
    _account: unknown,
    _db: unknown,
    eventTicker: string,
  ) => {
    state.lookups.push(eventTicker)
    state.pending++
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (state.pending > 1) state.overlapped = true
    state.pending--
    if (eventTicker === state.failOn) throw new Error('lookup failed')
    return { gameId: null, league: null }
  },
  subjectFor: () => Promise.resolve({ teamId: null, playerId: null }),
}))

const env = { DB: {} } as CloudflareEnv
const account = { keyId: 'k', signer: {} } as unknown as KalshiAccount

function market(ticker: string, event = `E-${ticker}`) {
  return {
    ticker,
    event_ticker: event,
    title: ticker,
    yes_sub_title: ticker,
    status: 'active',
  }
}

function combo(legs: Array<{ ticker: string; event: string }>): KalshiMarket {
  for (const l of legs) state.markets[l.ticker] = market(l.ticker, l.event)
  return {
    ...market('COMBO'),
    mve_selected_legs: legs.map((l) => ({
      event_ticker: l.event,
      market_ticker: l.ticker,
      side: 'yes' as const,
    })),
  } as unknown as KalshiMarket
}

const fields = {
  side: 'yes' as const,
  contracts: 10,
  cost: 4,
  status: 'open' as const,
}

describe.skipIf(!isBun)('saving a Prediction', () => {
  let db: Database
  let sqlite: {
    run: (sql: string) => void
    query: (sql: string) => { all: () => Array<Record<string, unknown>> }
  }
  let save: typeof Save

  beforeEach(async () => {
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite
    db = fresh.db as unknown as Database
    state.markets = {}
    state.lookups = []
    state.pending = 0
    state.overlapped = false
    state.failOn = null
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
    save = await import('@/lib/kalshi/save')
  })

  const legs = () =>
    sqlite
      .query(
        "SELECT position, market_ticker FROM prediction_legs WHERE prediction_id = 'u1~COMBO' ORDER BY position",
      )
      .all()

  it('drops Legs at positions the market no longer has', async () => {
    await save.savePrediction(
      env,
      account,
      db,
      'u1',
      combo([
        { ticker: 'A', event: 'E1' },
        { ticker: 'B', event: 'E2' },
        { ticker: 'C', event: 'E3' },
      ]),
      fields,
    )
    expect(legs()).toHaveLength(3)

    await save.savePrediction(
      env,
      account,
      db,
      'u1',
      combo([
        { ticker: 'A', event: 'E1' },
        { ticker: 'B', event: 'E2' },
      ]),
      fields,
    )
    expect(legs()).toEqual([
      { position: 0, market_ticker: 'A' },
      { position: 1, market_ticker: 'B' },
    ])
  })

  it('looks Legs up side by side, each Game once', async () => {
    await save.savePrediction(
      env,
      account,
      db,
      'u1',
      combo([
        { ticker: 'A', event: 'E1' },
        { ticker: 'B', event: 'E1' },
        { ticker: 'C', event: 'E2' },
      ]),
      fields,
    )
    expect(state.lookups.sort()).toEqual(['E1', 'E2'])
    expect(state.overlapped).toBe(true)
    expect(legs()).toHaveLength(3)
  })

  it('saves nothing when a Leg cannot be looked up', async () => {
    state.failOn = 'E2'
    await expect(
      save.savePrediction(
        env,
        account,
        db,
        'u1',
        combo([
          { ticker: 'A', event: 'E1' },
          { ticker: 'B', event: 'E2' },
        ]),
        fields,
      ),
    ).rejects.toThrow('lookup failed')
    expect(sqlite.query('SELECT id FROM predictions').all()).toEqual([])
    expect(legs()).toEqual([])
  })
})
