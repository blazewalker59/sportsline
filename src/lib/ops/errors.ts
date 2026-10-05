/**
 * Reporting errors (docs/adr/0005): every failure in a job, sync or
 * request lands here. It's logged for Workers Logs, grouped by what went
 * wrong in `error_events` (counts, first and last seen, the latest
 * details) for the health page, and a new or returning kind pushes the
 * admins. Reporting never throws: a broken reporter must not break the
 * work it reports on. Server only.
 */

import { eq, inArray, sql } from 'drizzle-orm'
import type { CloudflareEnv } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import { errorEvents, pushSubscriptions, user } from '@/lib/db/schema'
import { vapidKeys } from '@/lib/push/deliver'
import { sendPush } from '@/lib/push/webpush'

/** Push the admins about one kind of error at most this often. */
const NOTIFY_EVERY_MS = 6 * 3_600_000

export type OpsEnv = Pick<
  CloudflareEnv,
  | 'DB'
  | 'ADMIN_EMAILS'
  | 'VAPID_PUBLIC_KEY'
  | 'VAPID_PRIVATE_JWK'
  | 'VAPID_SUBJECT'
>

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return typeof error === 'string' ? error : JSON.stringify(error)
}

/**
 * What kind of error this is: its scope and message with the parts that
 * vary (ids, numbers, quoted values) taken out, so repeats group together.
 */
export function fingerprintOf(scope: string, message: string): string {
  const shape = message
    .replace(/"[^"]*"|'[^']*'/g, '"…"')
    // Ids: long runs of letters and digits with a digit in them.
    .replace(/[A-Za-z0-9]*\d[A-Za-z0-9]*/g, (t) => (t.length >= 8 ? '#' : t))
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
  return `${scope}:${shape}`
}

export async function reportError(
  env: OpsEnv,
  scope: string,
  error: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const message = messageOf(error).slice(0, 500)
  const stack = error instanceof Error ? error.stack?.slice(0, 2000) : undefined
  console.error(`[${scope}] ${message}`, { scope, ...context, stack })
  try {
    const db = dbFromD1(env.DB)
    const now = new Date().toISOString()
    const fingerprint = fingerprintOf(scope, message)
    const row = await db
      .insert(errorEvents)
      .values({
        fingerprint,
        scope,
        message,
        count: 1,
        firstAt: now,
        lastAt: now,
        context: { ...context, stack },
      })
      .onConflictDoUpdate({
        target: errorEvents.fingerprint,
        set: {
          count: sql`${errorEvents.count} + 1`,
          lastAt: now,
          message,
          context: { ...context, stack },
        },
      })
      .returning()
      .get()
    const quiet =
      row.notifiedAt !== null &&
      Date.now() - Date.parse(row.notifiedAt) < NOTIFY_EVERY_MS
    if (!quiet) {
      await db
        .update(errorEvents)
        .set({ notifiedAt: now })
        .where(sql`${errorEvents.fingerprint} = ${fingerprint}`)
      await notifyAdmins(env, {
        title: `ERROR · ${scope}`,
        body: `${row.count > 1 ? `×${row.count} · ` : ''}${message}`,
      })
    }
  } catch (failure) {
    console.error('[ops] reporting failed', { failure: String(failure) })
  }
}

/** Push the admins' devices (the health page opens from it). */
export async function notifyAdmins(
  env: OpsEnv,
  message: { title: string; body: string },
): Promise<void> {
  const emails = adminEmails(env)
  const keys = vapidKeys(env as CloudflareEnv)
  if (emails.length === 0 || !keys) return
  const devices = await dbFromD1(env.DB)
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .innerJoin(user, eq(user.id, pushSubscriptions.viewerId))
    .where(inArray(sql`lower(${user.email})`, emails))
  await Promise.allSettled(
    devices.map((d) =>
      sendPush(
        d,
        JSON.stringify({
          ...message,
          url: '/admin',
          tag: 'sportsline-ops',
          final: false,
        }),
        keys,
        { topic: 'ops' },
      ),
    ),
  )
}

/** The admins' emails, lower-cased. */
export function adminEmails(env: Pick<CloudflareEnv, 'ADMIN_EMAILS'>) {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdmin(
  env: Pick<CloudflareEnv, 'ADMIN_EMAILS'>,
  email: string | null | undefined,
): boolean {
  return Boolean(email) && adminEmails(env).includes(email!.toLowerCase())
}
