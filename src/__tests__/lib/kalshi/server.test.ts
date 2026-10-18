/**
 * Kalshi server functions: connecting seals the key to its Viewer, syncing
 * reads only that Viewer's markets, and disconnecting is all or nothing.
 * Through the Start compiler's provider module so the handlers run; Kalshi
 * is a stand-in. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { atomicBatch } from '../../helpers/atomicBatch'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type * as KalshiClient from '@/lib/kalshi/client'
import * as caller from '@/lib/kalshi/server'
// @ts-expect-error The Start compiler's provider split is a query, not a TS path.
import * as provider from '@/lib/kalshi/server?tss-serverfn-split'
import { loadAccount } from '@/lib/kalshi/account'
import { isLegacy, unseal } from '@/lib/kalshi/vault'
import { kalshiAccounts, predictions } from '@/lib/db/schema'

type Opened = Awaited<ReturnType<typeof sqliteDb>>

interface Exec<T> {
  result?: T
  error?: unknown
}

type ServerFn = (opts: { data?: unknown }) => Promise<Exec<unknown>>

const SECRET = Buffer.alloc(32, 7).toString('base64')

const state = vi.hoisted(() => ({
  opened: null as Opened | null,
  env: {} as CloudflareEnv,
  refreshed: [] as Array<Array<unknown>>,
  imported: [] as Array<string>,
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.opened?.db,
  getDb: () => state.opened?.db,
  getCloudflareEnv: () => state.env,
}))

vi.mock('@/lib/auth/server', () => ({
  getAuth: () => ({
    api: {
      getSession: () =>
        Promise.resolve({
          user: { id: 'u1', name: 'V', email: 'v@example.com' },
        }),
    },
  }),
}))

vi.mock('@/lib/kalshi/keys', () => ({
  importSigningKey: (pem: string) => {
    state.imported.push(pem)
    return Promise.resolve({ type: 'ed25519' as const })
  },
}))

vi.mock('@/lib/kalshi/client', async (original) => ({
  ...(await original<typeof KalshiClient>()),
  apiKeys: () =>
    Promise.resolve([{ api_key_id: 'key-12345', scopes: ['read'] }]),
}))

vi.mock('@/lib/kalshi/sync', () => ({
  syncAccount: () => Promise.resolve({ open: 1, settled: 0 }),
  refreshPrices: (...args: Array<unknown>) => {
    state.refreshed.push(args)
    return Promise.resolve(0)
  },
}))

vi.mock('@/lib/live/startViewerSync', () => ({
  startViewerSync: () => Promise.resolve(),
}))

const fns = provider as unknown as Record<string, ServerFn>

async function call<T>(name: string, data?: unknown): Promise<Exec<T>> {
  const { serverRequestContext } = await import('@/lib/db')
  const fn = fns[`${name}_createServerFn_handler`]
  return runWithStartContext(
    {
      getRouter: () => ({}) as never,
      request: new Request('https://sportsline.dev/'),
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

const PEM = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(80)}\n-----END PRIVATE KEY-----`

function opened(): Opened {
  if (!state.opened) throw new Error('db')
  return state.opened
}

describe.skipIf(!isBun)('Kalshi server functions', () => {
  beforeEach(async () => {
    state.opened = await sqliteDb()
    atomicBatch(state.opened.sqlite, state.opened.db)
    state.env = {
      DB: {},
      KALSHI_ENCRYPTION_KEY: SECRET,
    } as unknown as CloudflareEnv
    state.refreshed = []
    state.imported = []
    opened().sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0),('u2','W','w@example.com',1,0,0)",
    )
  })

  it('loads the caller wrappers coverage measures', () => {
    expect(typeof caller.syncKalshiNow).toBe('function')
  })

  it('seals a connected key to its Viewer', async () => {
    const connected = await call('connectKalshi', {
      keyId: 'key-12345',
      privateKey: PEM,
    })
    expect(connected.error).toBeUndefined()
    const row = (await opened().db.select().from(kalshiAccounts).get())!
    const sealed = { ciphertext: row.keyCiphertext, iv: row.keyIv }
    expect(isLegacy(sealed)).toBe(false)
    expect(
      await unseal(SECRET, sealed, { purpose: 'kalshi-read', viewerId: 'u1' }),
    ).toBe(PEM)
    await expect(
      unseal(SECRET, sealed, { purpose: 'kalshi-read', viewerId: 'u2' }),
    ).rejects.toThrow()
    await expect(
      unseal(SECRET, sealed, { purpose: 'kalshi-trade', viewerId: 'u1' }),
    ).rejects.toThrow()
  })

  it('refreshes only the syncing Viewer’s prices', async () => {
    const synced = await call('syncKalshiNow')
    expect(synced.result).toEqual({ open: 1, settled: 0 })
    expect(state.refreshed).toEqual([[state.env, 'u1']])
  })

  it('disconnects all at once, or not at all', async () => {
    await call('connectKalshi', { keyId: 'key-12345', privateKey: PEM })
    await opened().db.insert(predictions).values({
      id: 'u1~KX',
      viewerId: 'u1',
      marketTicker: 'KX',
      kind: 'single',
      side: 'yes',
      title: 'Yankees',
      contracts: 1,
      cost: 0.5,
      status: 'open',
      openedAt: '2026-10-08T00:00:00Z',
      updatedAt: '2026-10-08T00:00:00Z',
    })
    opened().sqlite.run(
      "CREATE TRIGGER stuck BEFORE DELETE ON kalshi_accounts BEGIN SELECT RAISE(ABORT, 'stuck'); END",
    )
    const failed = await call('disconnectKalshi')
    expect(failed.error).toBeTruthy()
    expect(await opened().db.select().from(predictions)).toHaveLength(1)

    opened().sqlite.run('DROP TRIGGER stuck')
    expect((await call('disconnectKalshi')).error).toBeUndefined()
    expect(await opened().db.select().from(predictions)).toHaveLength(0)
    expect(await opened().db.select().from(kalshiAccounts)).toHaveLength(0)
  })

  it('opens a key sealed before binding, and binds it', async () => {
    // Sealed the old way: no version, no associated data.
    const key = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(Buffer.from(SECRET, 'base64')),
      'AES-GCM',
      false,
      ['encrypt'],
    )
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(PEM),
    )
    await opened()
      .db.insert(kalshiAccounts)
      .values({
        viewerId: 'u1',
        keyId: 'key-12345',
        keyType: 'ed25519',
        keyCiphertext: Buffer.from(ciphertext).toString('base64'),
        keyIv: Buffer.from(iv).toString('base64'),
        scopes: ['read'],
        status: 'ok',
        connectedAt: '2026-10-08T00:00:00Z',
      })

    expect(await loadAccount(state.env, 'u1')).toMatchObject({
      keyId: 'key-12345',
    })
    expect(state.imported).toEqual([PEM])
    const row = (await opened().db.select().from(kalshiAccounts).get())!
    const sealed = { ciphertext: row.keyCiphertext, iv: row.keyIv }
    expect(isLegacy(sealed)).toBe(false)
    expect(
      await unseal(SECRET, sealed, { purpose: 'kalshi-read', viewerId: 'u1' }),
    ).toBe(PEM)
    // Opens the same way next time.
    await loadAccount(state.env, 'u1')
    expect(state.imported).toEqual([PEM, PEM])
  })
})
