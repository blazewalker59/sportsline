/**
 * A Viewer's Kalshi connection, decrypted for signing (docs/adr/0003).
 * Server only.
 */

import { eq } from 'drizzle-orm'
import { importSigningKey } from './keys'
import { unseal } from './vault'
import type { KalshiAccount } from './client'
import type { CloudflareEnv } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import { kalshiAccounts } from '@/lib/db/schema'

/** A Viewer's connection, decrypted for signing; null if not connected. */
export async function loadAccount(
  env: Pick<CloudflareEnv, 'DB' | 'KALSHI_ENCRYPTION_KEY'>,
  viewerId: string,
): Promise<KalshiAccount | null> {
  const row = await dbFromD1(env.DB)
    .select()
    .from(kalshiAccounts)
    .where(eq(kalshiAccounts.viewerId, viewerId))
    .get()
  if (!row) return null
  const pem = await unseal(env.KALSHI_ENCRYPTION_KEY, {
    ciphertext: row.keyCiphertext,
    iv: row.keyIv,
  })
  return { keyId: row.keyId, signer: await importSigningKey(pem) }
}
