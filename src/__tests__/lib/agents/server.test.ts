/**
 * Agent server functions (tokens, the trade key, proposals, find_bet),
 * through the Start compiler's provider module so the handlers actually
 * run. The caller module is imported too: that is the file coverage
 * measures. Kalshi and the vault are stand-ins. Bun only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Trading from '@/lib/agents/trading'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type * as KalshiClient from '@/lib/kalshi/client'
import * as caller from '@/lib/agents/server'
// Handler bodies are extracted here; the plain import only has RPC stubs.
// @ts-expect-error The Start compiler's provider split is a query, not a TS path.
import * as provider from '@/lib/agents/server?tss-serverfn-split'
import { KalshiError } from '@/lib/kalshi/client'
import { sportsDayOf } from '@/lib/model/sportsDay'
import {
  apiTokens,
  betRequests,
  kalshiTradeKeys,
  tradeProposals,
  trendPicks,
} from '@/lib/db/schema'

type Sqlite = Awaited<ReturnType<typeof sqliteDb>>['sqlite']
type AppDb = Awaited<ReturnType<typeof sqliteDb>>['db']

interface Exec<T> {
  result?: T
  error?: unknown
}

type ServerFn = (opts: { data?: unknown }) => Promise<Exec<unknown>>

const state = vi.hoisted(() => ({
  db: null as AppDb | null,
  sqlite: null as Sqlite | null,
  env: {
    DB: { ready: true },
    KALSHI_ENCRYPTION_KEY: 'vault-secret',
  } as unknown as CloudflareEnv,
  session: null as { user: { id: string; name: string; email: string } } | null,
  keyError: false,
  apiKeys: null as
    Array<{ api_key_id: string; scopes: Array<string> }> | Error | null,
  sealed: [] as Array<{ secret: string | undefined; plaintext: string }>,
  approved: [] as Array<unknown>,
}))

vi.mock('@/lib/db', async (original) => {
  const mod = await original<typeof Db>()
  return {
    ...mod,
    dbFromD1: () => state.db,
    getDb: () => state.db,
    getCloudflareEnv: () => state.env,
  }
})

vi.mock('@/lib/auth/server', () => ({
  getAuth: () => ({
    api: { getSession: () => Promise.resolve(state.session) },
  }),
}))

vi.mock('@/lib/kalshi/keys', () => ({
  importSigningKey: () =>
    state.keyError
      ? Promise.reject(new Error('not a key'))
      : Promise.resolve({ type: 'ed25519' as const }),
}))

vi.mock('@/lib/kalshi/client', async (original) => {
  const mod = await original<typeof KalshiClient>()
  return {
    ...mod,
    apiKeys: () => {
      if (state.apiKeys instanceof Error) return Promise.reject(state.apiKeys)
      return Promise.resolve(state.apiKeys ?? [])
    },
  }
})

vi.mock('@/lib/kalshi/vault', () => ({
  seal: (secret: string | undefined, plaintext: string) => {
    state.sealed.push({ secret, plaintext })
    return Promise.resolve({ ciphertext: 'cipher', iv: 'iv' })
  },
}))

vi.mock('@/lib/agents/trading', async (original) => {
  const mod = await original<typeof Trading>()
  return {
    ...mod,
    approveTrade: (...args: Array<unknown>) => {
      state.approved.push(args)
      return Promise.resolve({ id: args[3], status: 'placing' })
    },
  }
})

const fns = provider as unknown as Record<string, ServerFn>

const PEM = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(80)}\n-----END PRIVATE KEY-----`

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function call<T>(name: string, data?: unknown): Promise<Exec<T>> {
  const { serverRequestContext } = await import('@/lib/db')
  const fn = fns[`${name}_createServerFn_handler`]
  if (!fn) {
    throw new Error(
      `missing ${name}_createServerFn_handler (${Object.keys(fns).join(', ')})`,
    )
  }
  return runWithStartContext(
    {
      getRouter: () => ({}) as never,
      request: new Request('https://sportsline.dev/agents'),
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: 'serverFn',
    },
    () =>
      serverRequestContext.run(
        { headers: new Headers({ cookie: 'session' }), env: state.env },
        () => fn({ data }) as Promise<Exec<T>>,
      ),
  )
}

function db(): AppDb {
  if (!state.db) throw new Error('db')
  return state.db
}

async function proposal(
  id: string,
  patch: Partial<typeof tradeProposals.$inferInsert> = {},
) {
  await db()
    .insert(tradeProposals)
    .values({
      id,
      viewerId: 'u1',
      tokenId: 'tok',
      agentName: 'Grok',
      marketTicker: 'KX-1',
      marketTitle: 'Yankees',
      side: 'yes',
      action: 'buy',
      count: 10,
      limitCents: 54,
      maxCostDollars: 6,
      status: 'pending',
      createdAt: '2026-10-08T12:00:00.000Z',
      expiresAt: '2026-10-09T12:00:00.000Z',
      ...patch,
    })
}

describe.skipIf(!isBun)('agent server functions', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-08T18:00:00.000Z'))
    const opened = await sqliteDb()
    state.sqlite = opened.sqlite
    state.db = opened.db
    state.session = {
      user: { id: 'u1', name: 'Viewer', email: 'v@example.com' },
    }
    state.keyError = false
    state.apiKeys = null
    state.sealed = []
    state.approved = []
    state.sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0),('u2','W','w@example.com',1,0,0)",
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the caller wrappers coverage measures', () => {
    expect(typeof caller.getApiTokens).toBe('function')
    expect(typeof caller.connectTradeKey).toBe('function')
    expect(typeof caller.getBetRecord).toBe('function')
  })

  it('refuses a signed-out Viewer', async () => {
    state.session = null
    const listed = await call('getApiTokens')
    expect(message(listed.error)).toBe('Sign in required')
  })

  it('creates, lists and revokes tokens, and stops at ten active', async () => {
    const blank = await call('createApiToken', { name: '   ' })
    expect(blank.error).toBeTruthy()
    expect(await db().select().from(apiTokens)).toHaveLength(0)

    vi.setSystemTime(new Date('2026-10-08T18:00:00.000Z'))
    const first = await call<{ id: string; token: string }>('createApiToken', {
      name: '  Grok  ',
    })
    expect(first.error).toBeUndefined()
    expect(first.result?.token).toMatch(/^sl_[A-Za-z0-9_-]+$/)
    vi.setSystemTime(new Date('2026-10-08T18:01:00.000Z'))
    const trading = await call<{ token: string }>('createApiToken', {
      name: 'Trader',
      trade: true,
    })
    expect(trading.result?.token.startsWith('sl_')).toBe(true)

    const listed =
      await call<
        Array<{ name: string; scopes: Array<string>; prefix: string }>
      >('getApiTokens')
    expect(listed.result?.map((row) => [row.name, row.scopes])).toEqual([
      ['Trader', ['read', 'trade']],
      ['Grok', ['read']],
    ])
    expect(listed.result?.[0]?.prefix).toBe(trading.result?.token.slice(0, 10))

    await db()
      .insert(apiTokens)
      .values({
        id: 'other',
        viewerId: 'u2',
        name: 'Other',
        tokenHash: 'h'.repeat(64),
        prefix: 'sl_other',
        scopes: ['read'],
        createdAt: '2026-10-08T19:00:00.000Z',
      })
    const onlyMine = await call<Array<{ name: string }>>('getApiTokens')
    expect(onlyMine.result?.map((row) => row.name)).toEqual(['Trader', 'Grok'])

    await call('revokeApiToken', { id: first.result?.id })
    const afterRevoke = await call<Array<{ name: string }>>('getApiTokens')
    expect(afterRevoke.result?.map((row) => row.name)).toEqual(['Trader'])
    const revoked = await db().select().from(apiTokens)
    expect(revoked.find((row) => row.id === first.result?.id)?.revokedAt).toBe(
      '2026-10-08T18:01:00.000Z',
    )

    for (let n = 0; n < 9; n++) {
      const made = await call('createApiToken', { name: `extra-${n}` })
      expect(made.error).toBeUndefined()
    }
    const capped = await call('createApiToken', { name: 'one-too-many' })
    expect(message(capped.error)).toBe(
      'You have 10 tokens: revoke one to make another',
    )
    await call('revokeApiToken', { id: 'missing-for-someone-else' })
    const stillCapped = await call('createApiToken', { name: 'still-capped' })
    expect(message(stillCapped.error)).toBe(
      'You have 10 tokens: revoke one to make another',
    )
  })

  it('rejects a revoke id the validator will not accept', async () => {
    const bad = await call('revokeApiToken', { id: '' })
    expect(bad.error).toBeTruthy()
  })

  it('connects a trade-only key and raises the daily cap to the order cap', async () => {
    state.keyError = true
    const badKey = await call('connectTradeKey', {
      keyId: 'key-1234',
      privateKey: PEM,
      maxOrderDollars: 40,
      maxDailyDollars: 100,
    })
    expect(message(badKey.error)).toBe(
      'That isn’t a private key Kalshi issues. Paste the whole key, including its BEGIN and END lines.',
    )

    state.keyError = false
    state.apiKeys = new KalshiError(401, 'nope')
    const rejected = await call('connectTradeKey', {
      keyId: 'key-1234',
      privateKey: PEM,
      maxOrderDollars: 40,
      maxDailyDollars: 100,
    })
    expect(message(rejected.error)).toBe(
      'Kalshi didn’t accept this key. Check the key ID matches the private key, and that the key has the Read scope.',
    )

    state.apiKeys = new KalshiError(403, 'forbidden')
    const forbidden = await call('connectTradeKey', {
      keyId: 'key-1234',
      privateKey: PEM,
      maxOrderDollars: 40,
      maxDailyDollars: 100,
    })
    expect(message(forbidden.error)).toBe(
      'Kalshi didn’t accept this key. Check the key ID matches the private key, and that the key has the Read scope.',
    )

    state.apiKeys = new Error('offline')
    const offline = await call('connectTradeKey', {
      keyId: 'key-1234',
      privateKey: PEM,
      maxOrderDollars: 40,
      maxDailyDollars: 100,
    })
    expect(message(offline.error)).toBe(
      'Couldn’t reach Kalshi to check the key. Try again.',
    )

    state.apiKeys = [{ api_key_id: 'key-1234', scopes: ['read', 'write'] }]
    const broad = await call('connectTradeKey', {
      keyId: 'key-1234',
      privateKey: PEM,
      maxOrderDollars: 40,
      maxDailyDollars: 100,
    })
    expect(message(broad.error)).toBe(
      'Sportsline needs a key with exactly the Read and Trade scopes: one that can trade but never withdraw or transfer money. Create one in Kalshi with only those.',
    )
    expect(await db().select().from(kalshiTradeKeys)).toHaveLength(0)

    state.apiKeys = [
      { api_key_id: 'other', scopes: ['write::trade', 'read'] },
      { api_key_id: 'key-1234', scopes: ['write::trade', 'read'] },
    ]
    const connected = await call('connectTradeKey', {
      keyId: '  key-1234  ',
      privateKey: PEM,
      maxOrderDollars: 40,
      maxDailyDollars: 10,
    })
    expect(connected.error).toBeUndefined()
    expect(state.sealed).toEqual([{ secret: 'vault-secret', plaintext: PEM }])
    const [key] = await db().select().from(kalshiTradeKeys)
    expect(key).toMatchObject({
      viewerId: 'u1',
      keyId: 'key-1234',
      keyType: 'ed25519',
      keyCiphertext: 'cipher',
      keyIv: 'iv',
      scopes: ['write::trade', 'read'],
      maxOrderDollars: 40,
      maxDailyDollars: 40,
      connectedAt: '2026-10-08T18:00:00.000Z',
    })

    const tooBig = await call('setTradeCaps', {
      maxOrderDollars: 1001,
      maxDailyDollars: 100,
    })
    expect(tooBig.error).toBeTruthy()
    const caps = await call('setTradeCaps', {
      maxOrderDollars: 80,
      maxDailyDollars: 50,
    })
    expect(caps.error).toBeUndefined()
    const [raised] = await db().select().from(kalshiTradeKeys)
    expect(raised?.maxOrderDollars).toBe(80)
    expect(raised?.maxDailyDollars).toBe(80)
  })

  it('rejects a short key id before asking Kalshi', async () => {
    const bad = await call('connectTradeKey', {
      keyId: 'short',
      privateKey: PEM,
      maxOrderDollars: 10,
      maxDailyDollars: 10,
    })
    expect(bad.error).toBeTruthy()
    expect(state.sealed).toEqual([])
  })

  it('forgets the trade key and rejects whatever is still pending', async () => {
    await db()
      .insert(kalshiTradeKeys)
      .values({
        viewerId: 'u1',
        keyId: 'key-1234',
        keyType: 'ed25519',
        keyCiphertext: 'cipher',
        keyIv: 'iv',
        scopes: ['write::trade', 'read'],
        maxOrderDollars: 25,
        maxDailyDollars: 100,
        connectedAt: '2026-10-08T12:00:00.000Z',
      })
    await proposal('pending-1')
    await proposal('filled-1', { status: 'filled', decidedAt: 'earlier' })
    await proposal('other-viewer', { viewerId: 'u2' })
    const done = await call('disconnectTradeKey')
    expect(done.error).toBeUndefined()
    expect(await db().select().from(kalshiTradeKeys)).toHaveLength(0)
    const rows = await db().select().from(tradeProposals)
    expect(rows.find((row) => row.id === 'pending-1')).toMatchObject({
      status: 'rejected',
      decidedAt: '2026-10-08T18:00:00.000Z',
    })
    expect(rows.find((row) => row.id === 'filled-1')?.status).toBe('filled')
    expect(rows.find((row) => row.id === 'other-viewer')?.status).toBe(
      'pending',
    )
  })

  it('lists pending proposals first and counts today toward the cap', async () => {
    const today = sportsDayOf(new Date())
    await db()
      .insert(kalshiTradeKeys)
      .values({
        viewerId: 'u1',
        keyId: 'key-1234',
        keyType: 'ed25519',
        keyCiphertext: 'cipher',
        keyIv: 'iv',
        scopes: ['read'],
        maxOrderDollars: 25,
        maxDailyDollars: 100,
        connectedAt: '2026-10-01T00:00:00.000Z',
      })
    await proposal('pending-new', {
      createdAt: '2026-10-08T15:00:00.000Z',
      expiresAt: '2026-10-08T20:00:00.000Z',
    })
    await proposal('pending-old', {
      createdAt: '2026-10-08T14:00:00.000Z',
      expiresAt: '2026-10-08T20:00:00.000Z',
    })
    await proposal('lapsed', {
      createdAt: '2026-10-08T16:00:00.000Z',
      expiresAt: '2026-10-08T17:00:00.000Z',
    })
    await proposal('filled', {
      status: 'filled',
      createdAt: '2026-10-08T18:00:00.000Z',
      approvedDay: today,
      filledCount: 2,
      avgPriceDollars: 0.5,
      feesDollars: 0.1,
      maxCostDollars: 9,
    })
    await proposal('placing', {
      status: 'placing',
      createdAt: '2026-10-08T17:00:00.000Z',
      approvedDay: today,
      maxCostDollars: 3,
    })
    await proposal('yesterday', {
      status: 'filled',
      createdAt: '2026-10-07T12:00:00.000Z',
      approvedDay: '2026-10-07',
      filledCount: 4,
      avgPriceDollars: 1,
      feesDollars: 0,
    })
    await proposal('theirs', {
      viewerId: 'u2',
      createdAt: '2026-10-08T19:00:00.000Z',
    })

    const view = await call<{
      key: { keyId: string; maxOrderDollars: number } | null
      spentToday: number
      trades: Array<{ id: string; status: string }>
    }>('getTrading')
    expect(view.error).toBeUndefined()
    expect(view.result?.key).toMatchObject({
      keyId: 'key-1234',
      maxOrderDollars: 25,
      maxDailyDollars: 100,
    })
    expect(view.result?.spentToday).toBeCloseTo(4.1)
    expect(view.result?.trades.map((row) => [row.id, row.status])).toEqual([
      ['pending-new', 'pending'],
      ['pending-old', 'pending'],
      ['filled', 'filled'],
      ['placing', 'placing'],
      ['lapsed', 'expired'],
      ['yesterday', 'filled'],
    ])
  })

  it('sends an approval to the trading path and rejects a pending proposal', async () => {
    await proposal('prop-1')
    const approved = await call<{ id: string; status: string }>(
      'approveTradeProposal',
      { id: 'prop-1' },
    )
    expect(approved.result).toEqual({ id: 'prop-1', status: 'placing' })
    expect(state.approved).toHaveLength(1)
    const args = state.approved[0] as Array<unknown>
    expect(args[0]).toBe(state.env)
    expect(args[2]).toBe('u1')
    expect(args[3]).toBe('prop-1')

    const empty = await call('approveTradeProposal', { id: '' })
    expect(empty.error).toBeTruthy()

    const rejected = await call('rejectTradeProposal', { id: 'prop-1' })
    expect(rejected.error).toBeUndefined()
    const [row] = await db().select().from(tradeProposals)
    expect(row?.status).toBe('rejected')
    expect(row?.decidedAt).toBe('2026-10-08T18:00:00.000Z')
  })

  it('returns the find_bet record newest first, fifteen at a time', async () => {
    await db()
      .insert(betRequests)
      .values({
        id: 'req-1',
        viewerId: 'u1',
        tokenId: 'tok',
        agentName: 'Grok',
        ask: { count: 2 },
        games: 4,
        picks: 16,
        createdAt: '2026-10-08T12:00:00.000Z',
      })
    for (let n = 0; n < 16; n++) {
      await db()
        .insert(trendPicks)
        .values({
          id: `pick-${n}`,
          requestId: 'req-1',
          viewerId: 'u1',
          rank: n,
          marketTicker: `KX-${n}`,
          side: 'yes',
          marketKind: 'moneyline',
          title: `Pick ${n}`,
          gameLabel: 'NYY @ BOS',
          league: 'mlb',
          gameId: 'gm_1',
          startsAt: '2026-10-08T23:00:00.000Z',
          price: 0.45,
          fair: 0.55,
          trendChance: 0.6,
          edge: 0.1,
          createdAt: `2026-10-08T12:00:${String(n).padStart(2, '0')}.000Z`,
        })
    }
    await db()
      .insert(betRequests)
      .values({
        id: 'req-2',
        viewerId: 'u2',
        tokenId: 'tok',
        agentName: 'Other',
        ask: { count: 1 },
        games: 1,
        picks: 1,
        createdAt: '2026-10-08T12:00:00.000Z',
      })
    await db().insert(trendPicks).values({
      id: 'pick-theirs',
      requestId: 'req-2',
      viewerId: 'u2',
      rank: 1,
      marketTicker: 'KX-X',
      side: 'no',
      marketKind: 'spread',
      title: 'Theirs',
      gameLabel: 'A @ B',
      league: 'nba',
      gameId: 'gm_2',
      startsAt: '2026-10-08T23:00:00.000Z',
      price: 0.4,
      fair: 0.5,
      trendChance: 0.5,
      edge: 0.1,
      createdAt: '2026-10-08T19:00:00.000Z',
    })

    const record = await call<{
      stats: { requests: number; picksOffered: number }
      recent: Array<{ id: string }>
    }>('getBetRecord')
    expect(record.error).toBeUndefined()
    expect(record.result?.stats.requests).toBe(1)
    expect(record.result?.stats.picksOffered).toBe(16)
    expect(record.result?.recent).toHaveLength(15)
    expect(record.result?.recent[0]?.id).toBe('pick-15')
    expect(record.result?.recent[14]?.id).toBe('pick-1')
    expect(record.result?.recent.map((row) => row.id)).not.toContain(
      'pick-theirs',
    )
  })
})
