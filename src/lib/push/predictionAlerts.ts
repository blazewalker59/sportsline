/**
 * Prediction Alerts at their key moments (CONTEXT.md, "Alert"): the odds
 * on the Viewer's side swinging by ODDS_SWING since they last heard, a
 * Combo's Leg hitting or missing, and the Prediction's result. Read from
 * Kalshi's prices and markets, not plays: run by the Scheduler after each
 * price refresh. Server only.
 *
 * A Prediction is first seen silently (its odds become the baseline, its
 * settled Legs marked), so turning this on never replays history.
 */

import { and, desc, eq, gte, inArray, or } from 'drizzle-orm'
import { alertLevels, vapidKeys } from './deliver'
import { sendPush } from './webpush'
import type { AlertMessage } from './alerts'
import type { CloudflareEnv, Database } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import {
  alertMarks,
  kalshiMarkets,
  predictionLegs,
  predictions,
  pushSubscriptions,
  timelineItems,
} from '@/lib/db/schema'

/**
 * A move this large in the Viewer's chance (0–1) is worth an Alert, at
 * most once per SWING_COOLDOWN_MS a Prediction. Tuned against a real
 * Saturday's prices: 10 points made 51 Alerts from four Predictions; 20
 * points with a 20-minute rest made 11.
 */
export const ODDS_SWING = 0.2
const SWING_COOLDOWN_MS = 20 * 60_000
/** Results older than this when first noticed aren't news. */
const RESULT_FRESH_MS = 3 * 3_600_000
/** A Scoring Play this recent explains an odds swing. */
const RECENT_PLAY_MS = 10 * 60_000

type Market = typeof kalshiMarkets.$inferSelect

export function chanceFor(
  m: Market | undefined,
  side: 'yes' | 'no',
): number | null {
  if (!m) return null
  const yes =
    m.yesBid !== null && m.yesAsk !== null && m.yesAsk > 0
      ? (m.yesBid + m.yesAsk) / 2
      : m.lastPrice
  return yes === null ? null : side === 'yes' ? yes : 1 - yes
}

const pct = (n: number) => `${Math.round(n * 100)}%`
const money = (n: number) =>
  `${n < 0 ? '−' : '+'}$${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`

/** "Browns win: 63% ▲11". */
export function swingTitle(title: string, chance: number, was: number): string {
  const move = Math.round((chance - was) * 100)
  return `PREDICTION · ${title}: ${pct(chance)} ${move > 0 ? '▲' : '▼'}${Math.abs(move)}`
}

interface Pending {
  viewerId: string
  message: AlertMessage
  mark?: Array<string>
}

export async function sendPredictionAlerts(
  env: Pick<
    CloudflareEnv,
    'DB' | 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_JWK' | 'VAPID_SUBJECT'
  >,
): Promise<number> {
  const keys = vapidKeys(env as CloudflareEnv)
  if (!keys) return 0
  const db = dbFromD1(env.DB)
  const devices = await db.select().from(pushSubscriptions)
  if (devices.length === 0) return 0
  const levels = await alertLevels(
    db,
    devices.map((d) => d.viewerId),
  )
  const viewers = [...levels]
    .filter(([, l]) => l.predictions !== 'off')
    .map(([id]) => id)
  if (viewers.length === 0) return 0

  const since = new Date(Date.now() - RESULT_FRESH_MS).toISOString()
  const preds = await db
    .select()
    .from(predictions)
    .where(
      and(
        inArray(predictions.viewerId, viewers),
        or(eq(predictions.status, 'open'), gte(predictions.settledAt, since)),
      ),
    )
  if (preds.length === 0) return 0
  const legs = await inChunks(
    preds.map((p) => p.id),
    (part) =>
      db
        .select()
        .from(predictionLegs)
        .where(inArray(predictionLegs.predictionId, part)),
  )
  const tickers = [
    ...new Set([
      ...preds.map((p) => p.marketTicker),
      ...legs.map((l) => l.marketTicker),
    ]),
  ]
  const markets = new Map(
    (
      await inChunks(tickers, (part) =>
        db
          .select()
          .from(kalshiMarkets)
          .where(inArray(kalshiMarkets.ticker, part)),
      )
    ).map((m) => [m.ticker, m]),
  )
  const markKeys = preds.flatMap((p) => [
    `settled:${p.id}`,
    `swing:${p.id}`,
    ...legs
      .filter((l) => l.predictionId === p.id)
      .map((l) => `leg:${p.id}:${l.position}`),
  ])
  const markRows = await inChunks(markKeys, (part) =>
    db.select().from(alertMarks).where(inArray(alertMarks.key, part)),
  )
  const marked = new Set(markRows.map((m) => m.key))
  const markedAt = new Map(markRows.map((m) => [m.key, Date.parse(m.at)]))

  const pending: Array<Pending> = []
  const silent: Array<string> = []
  const swung: Array<string> = []
  const baselines: Array<{ id: string; chance: number }> = []
  for (const p of preds) {
    // First sight: remember where things stand, say nothing.
    const firstSight = p.alertChance === null
    const url = `/?scope=predictions&prediction=${encodeURIComponent(p.id)}`
    const tag = `prediction-${p.id}`
    const pLegs = legs
      .filter((l) => l.predictionId === p.id)
      .sort((a, b) => a.position - b.position)
    const settledKey = `settled:${p.id}`

    // The result: a settled Prediction, or a single whose market resolved.
    const own = markets.get(p.marketTicker)
    const resolved =
      p.status !== 'open'
        ? p.result
        : p.kind === 'single' && (own?.result === 'yes' || own?.result === 'no')
          ? own.result === p.side
            ? 'won'
            : 'lost'
          : null
    if (
      (resolved === 'won' || resolved === 'lost') &&
      !marked.has(settledKey)
    ) {
      if (firstSight) silent.push(settledKey)
      else {
        const pnl =
          p.pnl ?? (resolved === 'won' ? p.contracts - p.cost : -p.cost)
        pending.push({
          viewerId: p.viewerId,
          message: {
            title: `PREDICTION · ${resolved === 'won' ? 'Won' : 'Lost'} ${money(pnl)}`,
            body: p.title,
            url,
            tag,
            final: true,
          },
          mark: [settledKey],
        })
      }
      continue
    }

    // A Combo's Legs as they resolve.
    if (p.kind === 'combo') {
      const status = (l: (typeof pLegs)[number]) => {
        const r = markets.get(l.marketTicker)?.result
        return r === 'yes' || r === 'no'
          ? r === l.side
            ? 'won'
            : 'lost'
          : null
      }
      const hit = pLegs.filter((l) => status(l) === 'won').length
      let sentLeg = false
      for (const l of pLegs) {
        const s = status(l)
        const key = `leg:${p.id}:${l.position}`
        if (!s || marked.has(key)) continue
        if (firstSight || sentLeg) {
          // One Leg Alert a pass; the rest wait (or are history).
          if (firstSight) silent.push(key)
          continue
        }
        sentLeg = true
        pending.push({
          viewerId: p.viewerId,
          message:
            s === 'won'
              ? {
                  title: `PREDICTION · Leg hit ✓ ${l.title}`,
                  body: `${hit} of ${pLegs.length} legs in · ${p.title} · pays $${p.contracts.toFixed(2)}`,
                  url,
                  tag,
                  final: true,
                }
              : {
                  title: `PREDICTION · Leg missed ✕ ${l.title}`,
                  body: `Combo lost ${money(-p.cost)} · ${p.title}`,
                  url,
                  tag,
                  final: true,
                },
          // A missed Leg is the Combo's result too.
          mark: s === 'lost' ? [key, settledKey] : [key],
        })
      }
      if (sentLeg) continue
    }

    // The odds on the Viewer's side swinging since they last heard.
    if (p.status !== 'open') continue
    const chance = chanceFor(own, p.side)
    if (chance === null) continue
    if (firstSight) {
      baselines.push({ id: p.id, chance })
      continue
    }
    if (Math.abs(chance - p.alertChance!) < ODDS_SWING) continue
    // Resting since the last swing: the baseline holds until it's over.
    const lastSwing = markedAt.get(`swing:${p.id}`)
    if (lastSwing && Date.now() - lastSwing < SWING_COOLDOWN_MS) continue
    baselines.push({ id: p.id, chance })
    swung.push(`swing:${p.id}`)
    const play = await recentScore(
      db,
      pLegs.flatMap((l) => (l.gameId ? [l.gameId] : [])),
    )
    pending.push({
      viewerId: p.viewerId,
      message: {
        title: swingTitle(p.title, chance, p.alertChance!),
        body: play ?? `Was ${pct(p.alertChance!)} when you last heard`,
        url,
        tag,
        final: false,
      },
    })
  }

  const now = new Date().toISOString()
  for (const b of baselines)
    await db
      .update(predictions)
      .set({ alertChance: b.chance })
      .where(eq(predictions.id, b.id))
  // Swing marks hold the time of the last swing Alert: replaced each time.
  for (let i = 0; i < swung.length; i += 40)
    await db
      .insert(alertMarks)
      .values(swung.slice(i, i + 40).map((key) => ({ key, at: now })))
      .onConflictDoUpdate({
        target: alertMarks.key,
        set: { at: now },
      })
  const marks = [...silent, ...pending.flatMap((x) => x.mark ?? [])]
  for (let i = 0; i < marks.length; i += 40)
    await db
      .insert(alertMarks)
      .values(marks.slice(i, i + 40).map((key) => ({ key, at: now })))
      .onConflictDoNothing()

  let sent = 0
  const gone = new Set<string>()
  for (const x of pending) {
    for (const d of devices.filter((dv) => dv.viewerId === x.viewerId)) {
      const result = await sendPush(d, JSON.stringify(x.message), keys, {
        topic: x.message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
      }).catch(() => 'failed' as const)
      if (result === 'sent') sent++
      if (result === 'gone') gone.add(d.endpoint)
    }
  }
  if (gone.size > 0)
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.endpoint, [...gone]))
  return sent
}

/** The latest Scoring Play in these Games, if recent: what moved the odds. */
async function recentScore(
  db: Database,
  gameIds: ReadonlyArray<string>,
): Promise<string | null> {
  if (gameIds.length === 0) return null
  const row = await db
    .select({
      description: timelineItems.description,
      occurredAt: timelineItems.occurredAt,
    })
    .from(timelineItems)
    .where(
      and(
        inArray(timelineItems.gameId, [...new Set(gameIds)].slice(0, 80)),
        eq(timelineItems.significance, 'scoring'),
        eq(timelineItems.status, 'active'),
      ),
    )
    .orderBy(desc(timelineItems.occurredAt))
    .limit(1)
    .get()
  if (!row || Date.now() - Date.parse(row.occurredAt) > RECENT_PLAY_MS)
    return null
  return row.description
}

async function inChunks<T>(
  ids: ReadonlyArray<string>,
  query: (part: Array<string>) => Promise<Array<T>>,
): Promise<Array<T>> {
  const out: Array<T> = []
  for (let i = 0; i < ids.length; i += 80)
    out.push(...(await query(ids.slice(i, i + 80))))
  return out
}
