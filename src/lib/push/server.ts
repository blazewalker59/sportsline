/**
 * The Viewer's devices for Alerts: save or remove a Web Push subscription,
 * and hand browsers the public key they subscribe with.
 */

import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { vapidKeys } from './deliver'
import { sendPush } from './webpush'
import { DEFAULT_LEVELS } from './alerts'
import type { AlertLevels } from './alerts'
import { getAuth } from '@/lib/auth/server'
import { getCloudflareEnv, getDb, serverRequestContext } from '@/lib/db'
import { alertSettings, pushSubscriptions } from '@/lib/db/schema'

async function viewerId(): Promise<string> {
  const headers = serverRequestContext.getStore()?.headers
  const session = headers
    ? await getAuth(getCloudflareEnv()).api.getSession({ headers })
    : null
  if (!session?.user) throw new Error('Sign in required')
  return session.user.id
}

/** The VAPID public key browsers subscribe with; null when Alerts aren't configured. */
export const getPushKey = createServerFn({ method: 'GET' }).handler(
  (): Promise<string | null> =>
    Promise.resolve(getCloudflareEnv().VAPID_PUBLIC_KEY ?? null),
)

const subscriptionInput = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(40).max(200),
    auth: z.string().min(16).max(100),
  }),
})

export const savePushSubscription = createServerFn({ method: 'POST' })
  .validator((data: z.input<typeof subscriptionInput>) =>
    subscriptionInput.parse(data),
  )
  .handler(async ({ data }) => {
    const id = await viewerId()
    await getDb()
      .insert(pushSubscriptions)
      .values({
        endpoint: data.endpoint,
        viewerId: id,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { viewerId: id, p256dh: data.keys.p256dh, auth: data.keys.auth },
      })
    // A confirmation on the device just enabled: proves the whole path
    // (browser → push service → Worker) works, right when it matters.
    const keys = vapidKeys(getCloudflareEnv())
    if (!keys) return { confirmed: false }
    const result = await sendPush(
      {
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
      },
      JSON.stringify({
        title: 'Alerts are on',
        body: 'Scores for what you follow, key moments in your Predictions and Fantasy Matchups. Tune each in the menu.',
        url: '/',
        tag: 'sportsline-welcome',
      }),
      keys,
    ).catch(() => 'failed' as const)
    return { confirmed: result === 'sent' }
  })

export const deletePushSubscription = createServerFn({ method: 'POST' })
  .validator((data: { endpoint: string }) =>
    z.object({ endpoint: z.string().url().max(1000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const id = await viewerId()
    await getDb()
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, data.endpoint),
          eq(pushSubscriptions.viewerId, id),
        ),
      )
  })

/** The Viewer's Alert levels for each source (defaults until changed). */
export const getAlertLevels = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AlertLevels> => {
    const id = await viewerId()
    const row = await getDb()
      .select()
      .from(alertSettings)
      .where(eq(alertSettings.viewerId, id))
      .get()
    return row
      ? {
          following: row.following,
          predictions: row.predictions,
          fantasy: row.fantasy,
        }
      : DEFAULT_LEVELS
  },
)

const levelsInput = z.object({
  following: z.enum(['scores', 'finals', 'off']),
  predictions: z.enum(['key', 'scores', 'off']),
  fantasy: z.enum(['key', 'mine', 'off']),
})

export const setAlertLevels = createServerFn({ method: 'POST' })
  .validator((data: AlertLevels) => levelsInput.parse(data))
  .handler(async ({ data }): Promise<AlertLevels> => {
    const id = await viewerId()
    await getDb()
      .insert(alertSettings)
      .values({ viewerId: id, ...data })
      .onConflictDoUpdate({ target: alertSettings.viewerId, set: data })
    return data
  })
