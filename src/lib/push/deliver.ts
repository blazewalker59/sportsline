/**
 * Delivering play Alerts (CONTEXT.md, "Alert"): find the devices whose
 * Viewers' Team or Player Follows cover an item, whose open Predictions
 * depend on its Game, or with a Starter in it in a Fantasy Matchup; keep
 * those each Viewer's Alert levels allow; push one Alert a device, its
 * title naming the source. Called by LiveGame for news it just recorded.
 */

import { and, eq, inArray, or, sql } from 'drizzle-orm'
import {
  DEFAULT_LEVELS,
  alertMessage,
  fantasyEvent,
  isFollowingAlertable,
  isPredictionPlayAlertable,
} from './alerts'
import { sendPush } from './webpush'
import type { AlertLevels, AlertReason } from './alerts'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { TimelineItem } from '@/lib/model/timeline'
import type { VapidKeys } from './webpush'
import {
  alertSettings,
  fantasyLeagues,
  fantasyPlayers,
  follows,
  itemPlayers,
  kalshiMarkets,
  predictionLegs,
  predictions,
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

/** Each Viewer's Alert levels (the defaults until they change them). */
export async function alertLevels(
  db: Database,
  viewerIds: ReadonlyArray<string>,
): Promise<Map<string, AlertLevels>> {
  const out = new Map<string, AlertLevels>()
  const ids = [...new Set(viewerIds)]
  for (let i = 0; i < ids.length; i += 80) {
    const rows = await db
      .select()
      .from(alertSettings)
      .where(inArray(alertSettings.viewerId, ids.slice(i, i + 80)))
    for (const r of rows) out.set(r.viewerId, r)
  }
  for (const id of ids) if (!out.has(id)) out.set(id, DEFAULT_LEVELS)
  return out
}

/**
 * Devices of Viewers with an open Prediction resting on this Game, each
 * with a line about their Prediction ("Browns win: 63%").
 */
async function predictionRecipients(
  db: Database,
  item: TimelineItem,
): Promise<Array<Recipient & { reason: AlertReason }>> {
  const rows = await db
    .selectDistinct({
      endpoint: pushSubscriptions.endpoint,
      viewerId: pushSubscriptions.viewerId,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      title: predictions.title,
      side: predictions.side,
      yesBid: kalshiMarkets.yesBid,
      yesAsk: kalshiMarkets.yesAsk,
    })
    .from(pushSubscriptions)
    .innerJoin(
      predictions,
      and(
        eq(predictions.viewerId, pushSubscriptions.viewerId),
        eq(predictions.status, 'open'),
      ),
    )
    .innerJoin(
      predictionLegs,
      and(
        eq(predictionLegs.predictionId, predictions.id),
        eq(predictionLegs.gameId, item.gameId),
      ),
    )
    .leftJoin(kalshiMarkets, eq(kalshiMarkets.ticker, predictions.marketTicker))
  const byEndpoint = new Map<string, Recipient & { reason: AlertReason }>()
  for (const r of rows) {
    if (byEndpoint.has(r.endpoint)) continue
    const yes =
      r.yesBid !== null && r.yesAsk !== null ? (r.yesBid + r.yesAsk) / 2 : null
    const chance = yes === null ? null : r.side === 'yes' ? yes : 1 - yes
    byEndpoint.set(r.endpoint, {
      endpoint: r.endpoint,
      viewerId: r.viewerId,
      p256dh: r.p256dh,
      auth: r.auth,
      reason: {
        source: 'prediction',
        prediction:
          chance === null
            ? r.title
            : `${r.title}: ${Math.round(chance * 100)}%`,
      },
    })
  }
  return [...byEndpoint.values()]
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
 * Devices of Viewers with a Starter in this play in one of their Matchups
 * (theirs or their opponent's), with a line about it ("Your Stafford ·
 * TA 98.4–87.2 TB").
 */
async function fantasyRecipients(
  db: Database,
  item: TimelineItem,
  levels: (viewerId: string) => Promise<AlertLevels>,
  now: number,
): Promise<Array<Recipient & { reason: AlertReason }>> {
  const ids = item.players.map((p) => p.id)
  if (ids.length === 0) return []
  const rows = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      viewerId: pushSubscriptions.viewerId,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      side: fantasyPlayers.side,
      playerId: fantasyPlayers.playerId,
      matchup: fantasyLeagues.matchup,
    })
    .from(fantasyPlayers)
    .innerJoin(
      fantasyLeagues,
      and(
        eq(fantasyLeagues.id, fantasyPlayers.leagueRowId),
        eq(fantasyLeagues.enabled, true),
      ),
    )
    .innerJoin(
      pushSubscriptions,
      eq(pushSubscriptions.viewerId, fantasyLeagues.viewerId),
    )
    .where(
      and(
        eq(fantasyPlayers.starter, true),
        inArray(fantasyPlayers.playerId, ids),
      ),
    )
  const byEndpoint = new Map<string, Recipient & { reason: AlertReason }>()
  // The Viewer's own Starter wins over their opponent's in one play.
  for (const r of [...rows].sort((a, b) =>
    a.side === b.side ? 0 : a.side === 'mine' ? -1 : 1,
  )) {
    if (byEndpoint.has(r.endpoint) || !r.playerId) continue
    const level = (await levels(r.viewerId)).fantasy
    if (!fantasyEvent(item, r.playerId, r.side, level, now)) continue
    const m = r.matchup
    const name =
      item.players
        .find((p) => p.id === r.playerId)
        ?.name.split(' ')
        .at(-1) ?? 'player'
    byEndpoint.set(r.endpoint, {
      endpoint: r.endpoint,
      viewerId: r.viewerId,
      p256dh: r.p256dh,
      auth: r.auth,
      reason: {
        source: 'fantasy',
        side: r.side,
        player: name,
        matchup:
          m && m.opponent
            ? `${m.leagueName} ${m.mine.score}–${m.opponent.score}`
            : null,
      },
    })
  }
  return [...byEndpoint.values()]
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
  const now = Date.now()
  const cache = new Map<string, AlertLevels>()
  const levels = async (viewerId: string) => {
    if (!cache.has(viewerId))
      for (const [id, l] of await alertLevels(db, [viewerId])) cache.set(id, l)
    return cache.get(viewerId)!
  }
  for (const item of items) {
    // One Alert a device, the most personal source first: a Starter, then
    // a Prediction, then a Follow.
    const targets = new Map<string, Recipient & { reason: AlertReason }>()
    const add = (r: Recipient & { reason: AlertReason }) => {
      if (!targets.has(r.endpoint)) targets.set(r.endpoint, r)
    }
    if (item.kind === 'play' && item.players.length > 0)
      for (const r of await fantasyRecipients(db, item, levels, now)) add(r)
    if (item.kind === 'play' && item.significance === 'scoring')
      for (const r of await predictionRecipients(db, item))
        if (
          isPredictionPlayAlertable(
            item,
            (await levels(r.viewerId)).predictions,
            now,
          )
        )
          add(r)
    for (const r of await recipients(db, item))
      if (isFollowingAlertable(item, (await levels(r.viewerId)).following, now))
        add({ ...r, reason: { source: 'following' } })
    const allowed: Array<Recipient & { reason: AlertReason }> = []
    for (const r of targets.values())
      if (await allow(r.viewerId, item.kind === 'milestone')) allowed.push(r)
    const results = await Promise.allSettled(
      allowed.map((r) =>
        sendPush(r, JSON.stringify(alertMessage(item, r.reason)), keys, {
          topic: item.gameId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
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
