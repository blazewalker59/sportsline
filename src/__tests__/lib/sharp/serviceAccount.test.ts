/**
 * The account Sharp picks read Kalshi's markets with: an admin's
 * connected key, matched by email whatever its case. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'

const state = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))
vi.mock('@/lib/kalshi/account', () => ({
  loadAccount: (_env: unknown, viewerId: string) =>
    Promise.resolve({ keyId: `key-${viewerId}`, signer: {} }),
}))

describe.skipIf(!isBun)('serviceAccount', () => {
  let db: Db.Database
  let sqlite: { run: (sql: string) => void }

  beforeEach(async () => {
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite
    db = fresh.db as unknown as Db.Database
    state.db = db
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('a1','Admin','Admin@Example.com',1,0,0),('v1','Viewer','v@example.com',1,0,0)",
    )
    sqlite.run(
      "INSERT INTO kalshi_accounts (viewer_id,key_id,key_type,key_ciphertext,key_iv,scopes,status,connected_at) VALUES ('a1','k','ed25519','c','i','[]','ok','2026-10-01T00:00:00Z'),('v1','k2','ed25519','c','i','[]','ok','2026-10-01T00:00:00Z')",
    )
  })

  it("finds an admin's key whatever case their email is stored in", async () => {
    const { serviceAccount } = await import('@/lib/sharp/kalshi')
    const env = { ADMIN_EMAILS: 'admin@example.com' } as CloudflareEnv
    expect(await serviceAccount(env, db)).toMatchObject({ keyId: 'key-a1' })
    expect(
      await serviceAccount({ ADMIN_EMAILS: '' } as CloudflareEnv, db),
    ).toBeNull()
  })
})
