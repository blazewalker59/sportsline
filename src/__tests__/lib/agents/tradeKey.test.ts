/**
 * Opening a Viewer's Kalshi trade key, on the real migrations and the real
 * vault; signing is a stand-in. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import { kalshiTradeKeys } from '@/lib/db/schema'
import { isLegacy, unseal } from '@/lib/kalshi/vault'
import { tradeAccount } from '@/lib/agents/trading'

const SECRET = Buffer.alloc(32, 9).toString('base64')
const PEM = '-----BEGIN PRIVATE KEY-----\ntrade\n-----END PRIVATE KEY-----'

const state = vi.hoisted(() => ({
  db: null as unknown,
  imported: [] as Array<string>,
}))
vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))
vi.mock('@/lib/kalshi/keys', () => ({
  importSigningKey: (pem: string) => {
    state.imported.push(pem)
    return Promise.resolve({ type: 'ed25519' })
  },
}))

const env = { DB: {}, KALSHI_ENCRYPTION_KEY: SECRET } as CloudflareEnv

describe.skipIf(!isBun)('a Kalshi trade key', () => {
  let db: Db.Database

  beforeEach(async () => {
    const fresh = await sqliteDb()
    db = fresh.db as unknown as Db.Database
    state.db = db
    state.imported = []
    fresh.sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
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
    await db.insert(kalshiTradeKeys).values({
      viewerId: 'u1',
      keyId: 'trade-key',
      keyType: 'ed25519',
      keyCiphertext: Buffer.from(ciphertext).toString('base64'),
      keyIv: Buffer.from(iv).toString('base64'),
      scopes: ['read', 'write'],
      maxOrderDollars: 10,
      maxDailyDollars: 50,
      connectedAt: '2026-10-08T00:00:00Z',
    })
    const stored = async () => (await db.select().from(kalshiTradeKeys).get())!

    expect(await tradeAccount(env, await stored())).toMatchObject({
      keyId: 'trade-key',
    })
    expect(state.imported).toEqual([PEM])
    const row = await stored()
    const sealed = { ciphertext: row.keyCiphertext, iv: row.keyIv }
    expect(isLegacy(sealed)).toBe(false)
    expect(
      await unseal(SECRET, sealed, { purpose: 'kalshi-trade', viewerId: 'u1' }),
    ).toBe(PEM)
    // Opens the same way next time.
    await tradeAccount(env, row)
    expect(state.imported).toEqual([PEM, PEM])
  })
})
