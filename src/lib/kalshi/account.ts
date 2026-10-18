/**
 * A Viewer's Kalshi connection, decrypted for signing (docs/adr/0003).
 * Server only.
 */

import { and, eq } from 'drizzle-orm'
import { importSigningKey } from './keys'
import { isLegacy, seal, unseal } from './vault'
import type { KalshiAccount } from './client'
import type { CloudflareEnv } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import { kalshiAccounts } from '@/lib/db/schema'

/** A Viewer's connection, decrypted for signing; null if not connected. */
export async function loadAccount(
  env: Pick<CloudflareEnv, 'DB' | 'KALSHI_ENCRYPTION_KEY'>,
  viewerId: string,
): Promise<KalshiAccount | null> {
  const db = dbFromD1(env.DB)
  const row = await db
    .select()
    .from(kalshiAccounts)
    .where(eq(kalshiAccounts.viewerId, viewerId))
    .get()
  if (!row) return null
  const context = { purpose: 'kalshi-read', viewerId } as const
  const sealed = { ciphertext: row.keyCiphertext, iv: row.keyIv }
  const pem = await unseal(env.KALSHI_ENCRYPTION_KEY, sealed, context)
  // Sealed before keys were bound to their Viewer: bind it now (unless it
  // was reconnected meanwhile).
  if (isLegacy(sealed)) {
    const fresh = await seal(env.KALSHI_ENCRYPTION_KEY, pem, context)
    await db
      .update(kalshiAccounts)
      .set({ keyCiphertext: fresh.ciphertext, keyIv: fresh.iv })
      .where(
        and(
          eq(kalshiAccounts.viewerId, viewerId),
          eq(kalshiAccounts.keyCiphertext, row.keyCiphertext),
        ),
      )
  }
  return { keyId: row.keyId, signer: await importSigningKey(pem) }
}
