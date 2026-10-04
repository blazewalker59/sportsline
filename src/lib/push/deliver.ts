/**
 * Delivering Alerts (CONTEXT.md, "Alert"): find the devices whose Viewers'
 * Team or Player Follows cover an item, whose open Predictions depend on
 * its Game, or with a Starter in it in a Fantasy Matchup, push to each, and forget dead subscriptions. Called by
 * LiveGame for news it has just recorded.
 */

import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { alertMessage, isAlertable, isPredictionAlertable } from './alerts'
import { sendPush } from './webpush'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { TimelineItem } from '@/lib/model/timeline'
import type { VapidKeys } from './webpush'
import {
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
  /** Why a Prediction holder hears about it: their pick and its Odds now. */
  prediction?: string
}

/**
 * Devices of Viewers with an open Prediction resting on this Game, each
 * with a line about their Prediction ("Browns win: 63%").
 */
async function predictionRecipients(
  db: Database,
  item: TimelineItem,
): Promise<Array<Recipient>> {
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
  const byEndpoint = new Map<string, Recipient>()
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
      prediction:
        chance === null ? r.title : `${r.title}: ${Math.round(chance * 100)}%`,
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
): Promise<Array<Recipient>> {
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
  const byEndpoint = new Map<string, Recipient>()
  // The Viewer's own Starter wins over their opponent's in one play.
  for (const r of [...rows].sort((a, b) =>
    a.side === b.side ? 0 : a.side === 'mine' ? -1 : 1,
  )) {
    if (byEndpoint.has(r.endpoint)) continue
    const m = r.matchup
    const name =
      item.players
        .find((p) => p.id === r.playerId)
        ?.name.split(' ')
        .at(-1) ?? 'player'
    const score =
      m && m.opponent
        ? ` · ${m.mine.abbrev} ${m.mine.score}–${m.opponent.score} ${m.opponent.abbrev}`
        : ''
    byEndpoint.set(r.endpoint, {
      endpoint: r.endpoint,
      viewerId: r.viewerId,
      p256dh: r.p256dh,
      auth: r.auth,
      prediction: `${r.side === 'mine' ? 'Your' : 'Opponent’s'} ${name}${score}`,
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
  for (const item of items) {
    const message = alertMessage(item)
    // Follows Alert on Scoring Plays, Overturns and Finals; Predictions on
    // every Scoring and Notable Play. One push a device, Follows first.
    const targets = new Map<string, Recipient>()
    if (isPredictionAlertable(item, now)) {
      for (const r of await fantasyRecipients(db, item))
        targets.set(r.endpoint, r)
      for (const r of await predictionRecipients(db, item))
        targets.set(r.endpoint, r)
    }
    if (isAlertable(item, now))
      for (const r of await recipients(db, item))
        targets.set(r.endpoint, {
          ...r,
          prediction: targets.get(r.endpoint)?.prediction,
        })
    const allowed: Array<Recipient> = []
    for (const r of targets.values())
      if (await allow(r.viewerId, message.final)) allowed.push(r)
    const results = await Promise.allSettled(
      allowed.map((r) =>
        sendPush(
          r,
          JSON.stringify(
            r.prediction
              ? { ...message, body: `${message.body} · ${r.prediction}` }
              : message,
          ),
          keys,
          {
            topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
          },
        ),
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
