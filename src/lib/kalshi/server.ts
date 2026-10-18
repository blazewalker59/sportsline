/**
 * Kalshi over HTTP for the signed-in Viewer: connect a read-only key,
 * disconnect, and sync now. Predictions are read in predictionViews.ts,
 * one Prediction's detail in predictionDetail.ts.
 */

import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { KalshiError, apiKeys } from './client'
import { importSigningKey } from './keys'
import { isReadOnly } from './scopes'
import { refreshPrices, syncAccount } from './sync'
import { seal } from './vault'
import { getCloudflareEnv } from '@/lib/db'
import { kalshiAccounts, predictions } from '@/lib/db/schema'
import { sessionViewer, withViewer } from '@/lib/viewer/session'
import { reportError } from '@/lib/ops/errors'
import { startViewerSync } from '@/lib/live/startViewerSync'

export type ChangeDisplay = 'dollars' | 'percent'

export interface KalshiConnection {
  keyId: string
  status: 'ok' | 'error'
  lastError: string | null
  syncedAt: string | null
  /** How Prediction cards show profit or loss. */
  changeDisplay: ChangeDisplay
}

export const getKalshiConnection = createServerFn({ method: 'GET' }).handler(
  async (): Promise<KalshiConnection | null> => {
    const viewer = await sessionViewer()
    if (!viewer) return null
    return withViewer(async ({ db, viewerId }) => {
      const row = await db
        .select()
        .from(kalshiAccounts)
        .where(eq(kalshiAccounts.viewerId, viewerId))
        .get()
      return row
        ? {
            keyId: row.keyId,
            status: row.status,
            lastError: row.lastError,
            syncedAt: row.syncedAt,
            changeDisplay: row.changeDisplay,
          }
        : null
    })
  },
)

/**
 * Connect a Kalshi account with a read-only key (docs/adr/0003): the key
 * must sign a request Kalshi accepts, and Kalshi must list it as
 * read-only. Its private half is sealed before it's stored.
 */
export const connectKalshi = createServerFn({ method: 'POST' })
  .validator((data: { keyId: string; privateKey: string }) =>
    z
      .object({
        keyId: z.string().trim().min(8).max(100),
        privateKey: z.string().min(64).max(10_000),
      })
      .parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }): Promise<KalshiConnection> => {
      const env = getCloudflareEnv()
      let signer
      try {
        signer = await importSigningKey(data.privateKey)
      } catch {
        throw new Error(
          'That isn’t a private key Kalshi issues. Paste the whole key, including its BEGIN and END lines.',
        )
      }
      const account = { keyId: data.keyId, signer }
      let keys
      try {
        keys = await apiKeys(account)
      } catch (error) {
        if (
          error instanceof KalshiError &&
          (error.status === 401 || error.status === 403)
        ) {
          throw new Error(
            'Kalshi didn’t accept this key. Check the key ID matches the private key.',
          )
        }
        throw new Error('Couldn’t reach Kalshi to check the key. Try again.')
      }
      const key = keys.find((k) => k.api_key_id === data.keyId)
      if (!isReadOnly(key?.scopes)) {
        throw new Error(
          'This key can trade. Sportsline only accepts read-only keys: create one with only the Read scope in Kalshi.',
        )
      }
      const sealed = await seal(env.KALSHI_ENCRYPTION_KEY, data.privateKey, {
        purpose: 'kalshi-read',
        viewerId,
      })
      const now = new Date().toISOString()
      const row = {
        viewerId,
        keyId: data.keyId,
        keyType: signer.type,
        keyCiphertext: sealed.ciphertext,
        keyIv: sealed.iv,
        scopes: key!.scopes!,
        status: 'ok' as const,
        lastError: null,
        connectedAt: now,
        syncedAt: null,
        changeDisplay: 'dollars' as const,
      }
      await db
        .insert(kalshiAccounts)
        .values(row)
        .onConflictDoUpdate({ target: kalshiAccounts.viewerId, set: row })
      // First sync now, so Predictions appear straight away.
      try {
        await syncAccount(env, viewerId)
        await refreshPrices(env, viewerId)
      } catch (error) {
        await reportError(env, 'kalshi', error, { viewerId, step: 'connect' })
      }
      await startViewerSync(env, viewerId)
      return {
        keyId: row.keyId,
        status: 'ok',
        lastError: null,
        syncedAt: new Date().toISOString(),
        changeDisplay: row.changeDisplay,
      }
    }),
  )

/** Show Prediction cards' profit or loss in dollars or percent return. */
export const setChangeDisplay = createServerFn({ method: 'POST' })
  .validator((data: { display: string }) =>
    z.object({ display: z.enum(['dollars', 'percent']) }).parse(data),
  )
  .handler(({ data }) =>
    withViewer(async ({ db, viewerId }) => {
      await db
        .update(kalshiAccounts)
        .set({ changeDisplay: data.display })
        .where(eq(kalshiAccounts.viewerId, viewerId))
      return data.display
    }),
  )

/** Forget the key and every Prediction read with it. */
export const disconnectKalshi = createServerFn({ method: 'POST' }).handler(() =>
  withViewer(async ({ db, viewerId }) => {
    // In one batch: a failure halfway can't leave the key behind.
    await db.batch([
      db.delete(predictions).where(eq(predictions.viewerId, viewerId)),
      db.delete(kalshiAccounts).where(eq(kalshiAccounts.viewerId, viewerId)),
    ])
  }),
)

export const syncKalshiNow = createServerFn({ method: 'POST' }).handler(() =>
  withViewer(async ({ viewerId }) => {
    const env = getCloudflareEnv()
    const counts = await syncAccount(env, viewerId)
    // Only this Viewer's markets: never read with every Viewer's key.
    await refreshPrices(env, viewerId)
    return counts
  }),
)
