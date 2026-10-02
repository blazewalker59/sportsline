/**
 * Delivering Alerts (CONTEXT.md, "Alert"): find the devices whose Viewers'
 * Team or Player Follows cover an item, push to each, and forget dead
 * subscriptions. Called by LiveGame for news it has just recorded.
 */

import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { alertMessage } from './alerts'
import { sendPush } from './webpush'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { TimelineItem } from '@/lib/model/timeline'
import type { VapidKeys } from './webpush'
import {
  follows,
  itemPlayers,
  pushSubscriptions,
  timelineItems,
} from '@/lib/db/schema'

export function vapidKeys(env: CloudflareEnv): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) return null
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateJwk: env.VAPID_PRIVATE_JWK,
    subject: env.VAPID_SUBJECT ?? 'https://sportsline.dev',
  }
}

interface Recipient {
  endpoint: string
  viewerId: string
  p256dh: string
  auth: string
}

async function recipients(
  db: Database,
  item: TimelineItem,
): Promise<Array<Recipient>> {
  const teamIds = [item.awayTeam.id, item.homeTeam.id]
  const byPlayer =
    item.kind === 'milestone'
      ? // A Final: any followed Player who took part in the Game.
        inArray(
          follows.target,
          db
            .select({ id: itemPlayers.playerId })
            .from(itemPlayers)
            .innerJoin(timelineItems, eq(timelineItems.id, itemPlayers.itemId))
            .where(eq(timelineItems.gameId, item.gameId)),
        )
      : item.players.length > 0
        ? inArray(
            follows.target,
            item.players.map((p) => p.id),
          )
        : sql`0`
  return db
    .selectDistinct({
      endpoint: pushSubscriptions.endpoint,
      viewerId: pushSubscriptions.viewerId,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .innerJoin(follows, eq(follows.viewerId, pushSubscriptions.viewerId))
    .where(
      or(
        and(eq(follows.kind, 'team'), inArray(follows.target, teamIds)),
        and(eq(follows.kind, 'player'), byPlayer),
      ),
    )
}

/**
 * Push each item to its recipients. `allow` lets the caller cap how often
 * a Viewer hears about one Game (Finals should always be allowed).
 */
export async function deliverAlerts(
  db: Database,
  keys: VapidKeys,
  items: ReadonlyArray<TimelineItem>,
  allow: (viewerId: string, final: boolean) => Promise<boolean>,
): Promise<{ sent: number; pruned: number }> {
  let sent = 0
  const gone = new Set<string>()
  for (const item of items) {
    const message = alertMessage(item)
    const payload = JSON.stringify(message)
    const targets = await recipients(db, item)
    const allowed: Array<Recipient> = []
    for (const r of targets)
      if (await allow(r.viewerId, message.final)) allowed.push(r)
    const results = await Promise.allSettled(
      allowed.map((r) =>
        sendPush(r, payload, keys, {
          topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
        }),
      ),
    )
    results.forEach((res, i) => {
      if (res.status === 'fulfilled' && res.value === 'sent') sent++
      if (res.status === 'fulfilled' && res.value === 'gone')
        gone.add(allowed[i].endpoint)
      if (res.status === 'rejected')
        console.error('Alert push failed', String(res.reason))
    })
  }
  if (gone.size > 0) {
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.endpoint, [...gone]))
  }
  return { sent, pruned: gone.size }
}
