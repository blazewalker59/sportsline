/**
 * Bringing one Viewer's Predictions in line with Kalshi. The API is a
 * stand-in; rows land in the real migrations. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type { KalshiError as KalshiErrorClass } from '@/lib/kalshi/client'
import type * as Sync from '@/lib/kalshi/sync'
import type * as KalshiClient from '@/lib/kalshi/client'

const state = vi.hoisted(() => ({
  db: null as unknown,
  account: { keyId: 'k', signer: {} } as {
    keyId: string
    signer: object
  } | null,
  positions: [] as Array<Record<string, string>>,
  settlements: [] as Array<Record<string, unknown>>,
  markets: {} as Record<string, Record<string, unknown> | null>,
  marketError: null as Error | null,
  fills: null as Map<string, string> | null,
  fillsError: null as Error | null,
  reports: [] as Array<string>,
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))

vi.mock('@/lib/ops/errors', () => ({
  reportError: (_env: unknown, scope: string) => {
    state.reports.push(scope)
    return Promise.resolve()
  },
}))

vi.mock('@/lib/kalshi/account', () => ({
  loadAccount: () => Promise.resolve(state.account),
}))

vi.mock('@/lib/kalshi/client', async (original) => {
  const mod = await original<typeof KalshiClient>()
  return {
    ...mod,
    openPositions: () => Promise.resolve(state.positions),
    recentSettlements: () => Promise.resolve(state.settlements),
    markets: (_account: unknown, tickers: Array<string>) =>
      Promise.resolve(
        tickers.flatMap((ticker) => {
          const row = state.markets[ticker]
          return row ? [row] : []
        }),
      ),
    market: (_account: unknown, ticker: string) => {
      if (state.marketError) return Promise.reject(state.marketError)
      return Promise.resolve(state.markets[ticker] ?? null)
    },
    firstBuys: () => {
      if (state.fillsError) return Promise.reject(state.fillsError)
      return Promise.resolve(state.fills)
    },
    milestoneFor: () => Promise.resolve(null),
  }
})

const env = { DB: {} } as CloudflareEnv

function market(ticker: string) {
  return {
    ticker,
    event_ticker: `E-${ticker}`,
    title: ticker,
    yes_sub_title: ticker,
    status: 'active',
  }
}

describe.skipIf(!isBun)('Kalshi sync', () => {
  let sync: typeof Sync
  let KalshiError: typeof KalshiErrorClass
  let sqlite: { run: (sql: string) => void }

  beforeEach(async () => {
    vi.stubGlobal('fetch', () =>
      Promise.reject(new Error('unexpected network fetch')),
    )
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite
    state.db = fresh.db
    state.account = { keyId: 'k', signer: {} }
    state.positions = []
    state.settlements = []
    state.markets = {}
    state.marketError = null
    state.fills = new Map()
    state.fillsError = null
    state.reports = []
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
    sqlite.run(
      "INSERT INTO kalshi_accounts (viewer_id,key_id,key_type,key_ciphertext,key_iv,scopes,status,connected_at) VALUES ('u1','k','ed25519','c','i','[]','ok','2026-10-01T00:00:00Z')",
    )
    ;({ KalshiError } = await import('@/lib/kalshi/client'))
    sync = await import('@/lib/kalshi/sync')
  })

  const predictionRows = () =>
    (
      sqlite as unknown as {
        query: (sql: string) => { all: () => Array<Record<string, unknown>> }
      }
    )
      .query(
        'SELECT market_ticker, status, side, contracts, result, payout, traded_at FROM predictions ORDER BY market_ticker',
      )
      .all()

  const account = () =>
    (
      sqlite as unknown as {
        query: (sql: string) => {
          get: () => { status: string; last_error: string | null }
        }
      }
    )
      .query('SELECT status, last_error FROM kalshi_accounts')
      .get()

  it('does nothing without a connected account', async () => {
    state.account = null
    expect(await sync.syncAccount(env, 'u1')).toEqual({ open: 0, settled: 0 })
  })

  it('saves open positions, settles new markets, closes what was sold, and dates them', async () => {
    sqlite.run(
      "INSERT INTO predictions (id,viewer_id,market_ticker,kind,side,title,contracts,cost,status,opened_at,updated_at) VALUES ('u1~SOLD','u1','SOLD','single','yes','Sold',1,1,'open','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z'),('u1~KNOWN','u1','KNOWN','single','yes','Known',1,1,'settled','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z'),('u1~GAP','u1','GAP','single','yes','Gap',4,2,'settled','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z')",
    )
    sqlite.run(
      "UPDATE predictions SET result = 'won', payout = NULL, pnl = NULL WHERE market_ticker = 'GAP'",
    )
    state.positions = [
      { ticker: 'OPEN', position_fp: '10.00', market_exposure_dollars: '4.50' },
      { ticker: 'FLAT', position_fp: '0' },
      { ticker: 'NO', position_fp: '-3.00', market_exposure_dollars: '1.20' },
    ]
    const settledAt = new Date().toISOString()
    state.settlements = [
      {
        ticker: 'KNOWN',
        market_result: 'yes',
        yes_count_fp: '1',
        no_count_fp: '0',
        yes_total_cost_dollars: '1',
        no_total_cost_dollars: '0',
        revenue: 100,
        fee_cost: '0',
        settled_time: settledAt,
      },
      {
        ticker: 'WON',
        market_result: 'yes',
        yes_count_fp: '5.00',
        no_count_fp: '0',
        yes_total_cost_dollars: '2.00',
        no_total_cost_dollars: '0',
        revenue: 500,
        fee_cost: '0.10',
        settled_time: settledAt,
      },
      {
        ticker: 'LOST',
        market_result: 'no',
        yes_count_fp: '2.00',
        no_count_fp: '0',
        yes_total_cost_dollars: '1.00',
        no_total_cost_dollars: '0',
        revenue: 0,
        fee_cost: '0',
        settled_time: settledAt,
      },
      {
        ticker: 'VOID',
        market_result: 'scalar',
        yes_count_fp: '1',
        no_count_fp: '1',
        yes_total_cost_dollars: '0.5',
        no_total_cost_dollars: '0.5',
        revenue: 100,
        fee_cost: '0',
        settled_time: settledAt,
      },
    ]
    for (const ticker of ['OPEN', 'NO', 'WON', 'LOST', 'VOID'])
      state.markets[ticker] = market(ticker)
    state.fills = new Map([['OPEN', '2026-10-02T00:00:00.000Z']])
    const result = await sync.syncAccount(env, 'u1')
    expect(result).toEqual({ open: 2, settled: 3 })
    const rows = predictionRows()
    expect(rows.find((row) => row.market_ticker === 'OPEN')).toMatchObject({
      status: 'open',
      side: 'yes',
      contracts: 10,
      traded_at: '2026-10-02T00:00:00.000Z',
    })
    expect(rows.find((row) => row.market_ticker === 'NO')).toMatchObject({
      side: 'no',
      contracts: 3,
    })
    expect(rows.find((row) => row.market_ticker === 'SOLD')).toMatchObject({
      status: 'closed',
    })
    expect(rows.find((row) => row.market_ticker === 'WON')).toMatchObject({
      status: 'settled',
      result: 'won',
      payout: 5,
    })
    expect(rows.find((row) => row.market_ticker === 'LOST')).toMatchObject({
      result: 'lost',
    })
    expect(rows.find((row) => row.market_ticker === 'VOID')).toMatchObject({
      result: 'void',
    })
    expect(rows.find((row) => row.market_ticker === 'KNOWN')?.status).toBe(
      'settled',
    )
    const gap = rows.find((row) => row.market_ticker === 'GAP')
    expect(gap?.payout).toBe(4)
    expect(account().status).toBe('ok')
    expect(account().last_error).toBeNull()
  })

  it('stops the run on a rate limit, reports any other prediction error, and records a failed sync', async () => {
    state.positions = [
      { ticker: 'A', position_fp: '1', market_exposure_dollars: '0.5' },
      { ticker: 'B', position_fp: '1', market_exposure_dollars: '0.5' },
    ]
    state.marketError = new KalshiError(429, 'Kalshi 429')
    const limited = await sync.syncAccount(env, 'u1')
    expect(limited).toEqual({ open: 2, settled: 0 })
    expect(predictionRows()).toHaveLength(0)
    expect(account()).toMatchObject({
      status: 'ok',
      last_error: 'Kalshi asked us to slow down; the rest syncs shortly.',
    })
    expect(state.reports).toEqual([])

    state.marketError = new Error('bad market')
    state.markets = {}
    await sync.syncAccount(env, 'u1')
    expect(state.reports).toEqual(['kalshi', 'kalshi'])
    expect(account().status).toBe('ok')

    state.positions = []
    state.marketError = null
    state.fillsError = new Error('fills down')
    sqlite.run(
      "INSERT INTO predictions (id,viewer_id,market_ticker,kind,side,title,contracts,cost,status,opened_at,updated_at) VALUES ('u1~UNDATED','u1','UNDATED','single','yes','U',1,1,'open','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z')",
    )
    await sync.syncAccount(env, 'u1')
    expect(state.reports).toContain('kalshi')
    const undated = predictionRows().find(
      (row) => row.market_ticker === 'UNDATED',
    )
    expect(undated?.traded_at).toBeNull()

    vi.spyOn(
      await import('@/lib/kalshi/client'),
      'openPositions',
    ).mockRejectedValueOnce(new Error('kalshi down'))
    await expect(sync.syncAccount(env, 'u1')).rejects.toThrow('kalshi down')
    expect(account().status).toBe('error')
    expect(account().last_error).toContain('kalshi down')
  })

  it('lists accounts due a sync, oldest first', async () => {
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u2','W','w@example.com',1,0,0)",
    )
    const recent = new Date(Date.now() + 60_000).toISOString()
    sqlite.run(
      `INSERT INTO kalshi_accounts (viewer_id,key_id,key_type,key_ciphertext,key_iv,scopes,status,connected_at,synced_at) VALUES ('u2','k','ed25519','c','i','[]','ok','2026-10-01T00:00:00Z','${recent}')`,
    )
    expect(await sync.accountsDue(env, 60_000, 10)).toEqual(['u1'])
  })
})
