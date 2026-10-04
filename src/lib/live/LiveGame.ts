/// <reference types="@cloudflare/workers-types" />
/**
 * One Durable Object per live Game (docs/adr/0001). It polls the Game's
 * Source on an alarm, diffs the reported items against what it has already
 * seen, persists new Plays, Revisions, Overturns and Removals to D1 (the only
 * store), and hands the resulting Timeline events to the LiveHub.
 */

import { DurableObject } from 'cloudflare:workers'
import { eq, inArray, sql } from 'drizzle-orm'
import { diffItems, fingerprint } from './diff'
import { resolve } from './identity'
import { nextPollDelay } from './pacing'
import { itemRow, toTimelineItem } from './rows'
import type { BatchItem } from 'drizzle-orm/batch'
import type { SeenItem } from './diff'
import type { ItemRow, TrackedGame } from './rows'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { TimelineEvent, TimelineItem } from '@/lib/model/timeline'
import type {
  GameBox,
  GameSnapshot,
  SourceBox,
  SourceItem,
} from '@/lib/model/types'
import { sourceFor } from '@/lib/sources'
import { games, itemPlayers, players, timelineItems } from '@/lib/db/schema'
import { teamColors } from '@/lib/brand/teamColors'
import { dbFromD1 } from '@/lib/db'
import { isAlertable, isPredictionAlertable } from '@/lib/push/alerts'
import { deliverAlerts, vapidKeys } from '@/lib/push/deliver'

const GAME_KEY = 'game'
const SEEN_PREFIX = 'seen:'
const ERRORS_KEY = 'errors'
const POLLED_KEY = 'polled'
const ALERT_LOG_KEY = 'alertLog'
const ALERT_WINDOW_MS = 15 * 60_000
const ALERTS_PER_WINDOW = 6
const RETRY_MS = 30_000
/** Give up after this many consecutive failed polls; the cron re-wakes live Games. */
const MAX_CONSECUTIVE_ERRORS = 20
// D1 caps bound parameters per statement at 100.
const ITEM_ROWS_PER_INSERT = 3
const PLAYER_ROWS_PER_INSERT = 45

export interface TrackRequest extends TrackedGame {
  awayTeam: TrackedGame['awayTeam'] & { name: string }
  homeTeam: TrackedGame['homeTeam'] & { name: string }
}

export function itemId(gameId: string, key: string): string {
  return `${gameId}~${key}`
}

export class LiveGame extends DurableObject<CloudflareEnv> {
  private seen: Map<string, SeenItem> | null = null
  /** Source → Sportsline player ids already resolved, so box scores don't re-query. */
  private knownPlayers = new Map<string, string>()

  /** Start (or keep) tracking this Game. Idempotent; the cron calls it every minute. */
  async track(game: TrackRequest): Promise<void> {
    await this.ctx.storage.put(GAME_KEY, game)
    const alarm = await this.ctx.storage.getAlarm()
    if (alarm === null) await this.ctx.storage.setAlarm(Date.now())
  }

  /**
   * Poll the Source once more, outside the alarm loop: e.g. to fill in the
   * box score of a Game that finished before box scores were stored.
   * False if this LiveGame never tracked the Game.
   */
  async refresh(): Promise<boolean> {
    const game = await this.ctx.storage.get<TrackRequest>(GAME_KEY)
    if (!game) return false
    const snapshot = await sourceFor(game.league).snapshot(game.sourceGameId)
    await this.apply(game, snapshot)
    return true
  }

  async alarm(): Promise<void> {
    const game = await this.ctx.storage.get<TrackRequest>(GAME_KEY)
    if (!game) return
    let delay: number | null
    try {
      const snapshot = await sourceFor(game.league).snapshot(game.sourceGameId)
      await this.apply(game, snapshot)
      await this.ctx.storage.put(ERRORS_KEY, 0)
      delay = nextPollDelay(
        snapshot.status,
        snapshot.startsAt,
        new Date(),
        snapshot.pollHintSeconds,
      )
    } catch (error) {
      const errors = ((await this.ctx.storage.get<number>(ERRORS_KEY)) ?? 0) + 1
      await this.ctx.storage.put(ERRORS_KEY, errors)
      console.error('LiveGame poll failed', {
        gameId: game.gameId,
        errors,
        error: String(error),
      })
      delay = errors >= MAX_CONSECUTIVE_ERRORS ? null : RETRY_MS
    }
    if (delay !== null) await this.ctx.storage.setAlarm(Date.now() + delay)
  }

  private async loadSeen(): Promise<Map<string, SeenItem>> {
    if (!this.seen) {
      const stored = await this.ctx.storage.list<SeenItem>({
        prefix: SEEN_PREFIX,
      })
      this.seen = new Map(
        [...stored].map(([k, v]) => [k.slice(SEEN_PREFIX.length), v]),
      )
    }
    return this.seen
  }

  private async apply(
    game: TrackRequest,
    snapshot: GameSnapshot,
  ): Promise<void> {
    const seen = await this.loadSeen()
    const changes = diffItems(seen, snapshot.items)
    const db = dbFromD1(this.env.DB)
    const now = new Date().toISOString()

    const touched = changes.flatMap((c) =>
      c.type === 'removed' ? [] : [c.item],
    )
    const boxPlayers =
      snapshot.box?.tables.flatMap((t) => t.rows.map((r) => r.player)) ?? []
    const playerIds = await resolve(
      db,
      'player',
      sourceFor(game.league).source,
      game.league,
      [
        ...touched.flatMap((i) =>
          i.kind === 'play' ? [...i.involved, ...i.credits] : [],
        ),
        ...boxPlayers.filter((p) => !this.knownPlayers.has(p.sourceId)),
      ],
    )
    for (const [sourceId, id] of playerIds) this.knownPlayers.set(sourceId, id)
    // Sources sometimes give only an id (`#123`); the roster sync knows the name.
    const unnamed = touched.flatMap((i) =>
      i.kind === 'play' ? i.involved.filter((p) => p.name.startsWith('#')) : [],
    )
    if (unnamed.length > 0) {
      const ids = [
        ...new Set(unnamed.flatMap((p) => playerIds.get(p.sourceId) ?? [])),
      ]
      const known = new Map(
        (
          await db
            .select({ id: players.id, name: players.name })
            .from(players)
            .where(inArray(players.id, ids.slice(0, 90)))
        ).map((r) => [r.id, r.name]),
      )
      for (const p of unnamed) {
        const name = known.get(playerIds.get(p.sourceId) ?? '')
        if (name && !name.startsWith('#')) p.name = name
      }
    }
    const box = storedBox(snapshot.box, this.knownPlayers)

    const upserts: Array<ItemRow> = []
    const removedIds: Array<string> = []
    const nextSeen = new Map(seen)
    const remember = (item: SourceItem, id: string, stampedAt?: string) =>
      nextSeen.set(item.key, {
        id,
        ...fingerprint(item),
        ...(stampedAt ? { stampedAt } : {}),
      })
    // Sources without wall-clock times give estimates (SourceItem
    // .timeEstimated). An item first seen on a live poll happened about now;
    // only a Game's history, backfilled on the first poll, keeps the estimate.
    const backfilling = !(await this.ctx.storage.get<boolean>(POLLED_KEY))
    /** Items this poll is the first to record: candidates for Alerts. */
    const freshIds = new Set<string>()

    for (const change of changes) {
      switch (change.type) {
        case 'added':
        case 'revised': {
          const id = itemId(game.gameId, change.item.key)
          const row = itemRow(game, id, change.item, playerIds)
          let stampedAt: string | undefined
          if (change.type === 'revised') {
            row.revisedAt = now
            stampedAt = change.seen.stampedAt
          } else if (change.item.timeEstimated && !backfilling) {
            stampedAt = now
          }
          if (stampedAt) row.occurredAt = stampedAt
          upserts.push(row)
          if (change.type === 'added') freshIds.add(id)
          remember(change.item, id, stampedAt)
          break
        }
        case 'overturned': {
          // The original stays as it was, struck through; the Overturn is
          // news at the top of the Timeline (CONTEXT.md, "Overturn").
          const original = itemId(game.gameId, change.item.key)
          const news = itemRow(
            game,
            itemId(game.gameId, `overturn:${change.item.key}`),
            change.item,
            playerIds,
          )
          news.kind = 'overturn'
          news.itemKey = `overturn:${change.item.key}`
          news.occurredAt = now
          news.significance = 'scoring'
          news.description = `Overturned: ${change.seen.description}`
          news.overturnOf = original
          freshIds.add(news.id)
          upserts.push(news)
          remember(change.item, original, change.seen.stampedAt)
          break
        }
        case 'removed':
          removedIds.push(change.seen.id)
          nextSeen.delete(change.key)
          break
      }
    }
    const overturnedIds = changes.flatMap((c) =>
      c.type === 'overturned' ? [itemId(game.gameId, c.item.key)] : [],
    )

    // ── Persist (D1 is the record) ──────────────────────────────────────
    const statements: Array<BatchItem<'sqlite'>> = []
    statements.push(
      db
        .update(games)
        .set({
          status: snapshot.status,
          awayScore: snapshot.score.away,
          homeScore: snapshot.score.home,
          situation: snapshot.situation,
          box,
          // Only a Source that ranks teams (college football) sets these.
          ...(snapshot.away.rank !== undefined
            ? {
                awayRank: snapshot.away.rank,
                homeRank: snapshot.home.rank ?? null,
                awayConference: snapshot.away.conference ?? null,
                homeConference: snapshot.home.conference ?? null,
              }
            : {}),
          updatedAt: now,
        })
        .where(eq(games.id, game.gameId)),
    )
    for (let i = 0; i < upserts.length; i += ITEM_ROWS_PER_INSERT) {
      statements.push(
        db
          .insert(timelineItems)
          .values(upserts.slice(i, i + ITEM_ROWS_PER_INSERT))
          .onConflictDoUpdate({
            target: timelineItems.id,
            set: Object.fromEntries(
              UPDATABLE_COLUMNS.map((c) => [c, sql.raw(`excluded.${c}`)]),
            ),
          }),
      )
    }
    if (overturnedIds.length > 0) {
      statements.push(
        db
          .update(timelineItems)
          .set({ status: 'overturned', revisedAt: now })
          .where(inArray(timelineItems.id, overturnedIds)),
      )
    }
    const affected = [...upserts.map((r) => r.id), ...removedIds]
    if (affected.length > 0) {
      for (let i = 0; i < affected.length; i += 90) {
        statements.push(
          db
            .delete(itemPlayers)
            .where(inArray(itemPlayers.itemId, affected.slice(i, i + 90))),
        )
      }
    }
    if (removedIds.length > 0) {
      statements.push(
        db.delete(timelineItems).where(inArray(timelineItems.id, removedIds)),
      )
    }
    const links = upserts.flatMap((r) =>
      r.players.map((p) => ({ itemId: r.id, playerId: p.id })),
    )
    for (let i = 0; i < links.length; i += PLAYER_ROWS_PER_INSERT) {
      statements.push(
        db
          .insert(itemPlayers)
          .values(links.slice(i, i + PLAYER_ROWS_PER_INSERT))
          .onConflictDoNothing(),
      )
    }
    const [first, ...rest] = statements
    await db.batch([first, ...rest])

    // Remember only once D1 has the changes, so a failed write is retried.
    await this.ctx.storage.put(
      Object.fromEntries(
        changes.flatMap((c) =>
          c.type === 'removed'
            ? []
            : [[SEEN_PREFIX + c.item.key, nextSeen.get(c.item.key)]],
        ),
      ),
    )
    const removedKeys = changes.flatMap((c) =>
      c.type === 'removed' ? [SEEN_PREFIX + c.key] : [],
    )
    if (removedKeys.length > 0) await this.ctx.storage.delete(removedKeys)
    this.seen = nextSeen
    if (backfilling) await this.ctx.storage.put(POLLED_KEY, true)

    // ── Publish (the Hub is a relay, never a store) ─────────────────────
    const overturnedRows =
      overturnedIds.length > 0
        ? await db
            .select()
            .from(timelineItems)
            .where(inArray(timelineItems.id, overturnedIds))
        : []
    const away = {
      ...game.awayTeam,
      colors: teamColors(game.league, game.awayTeam.name),
      rank: snapshot.away.rank ?? null,
      conference: snapshot.away.conference ?? null,
    }
    const home = {
      ...game.homeTeam,
      colors: teamColors(game.league, game.homeTeam.name),
      rank: snapshot.home.rank ?? null,
      conference: snapshot.home.conference ?? null,
    }
    const events: Array<TimelineEvent> = [
      {
        type: 'game',
        game: {
          id: game.gameId,
          league: game.league,
          sportsDay: game.sportsDay,
          status: snapshot.status,
          startsAt: snapshot.startsAt,
          awayTeam: away,
          homeTeam: home,
          score: snapshot.score,
          situation: snapshot.situation,
        },
      },
      ...[...upserts, ...overturnedRows].map((row) => ({
        type: 'upsert' as const,
        item: toTimelineItem(row, away, home),
      })),
      ...removedIds.map((id) => ({
        type: 'remove' as const,
        id,
        gameId: game.gameId,
      })),
    ]
    const hub = this.env.LIVE_HUB.get(this.env.LIVE_HUB.idFromName('global'))
    await hub.publish(events)

    // Alerts (CONTEXT.md): only news, never backfilled history; a failure
    // here must never stop the Game being tracked.
    if (!backfilling) {
      const fresh = events.flatMap((e) =>
        e.type === 'upsert' &&
        freshIds.has(e.item.id) &&
        (isAlertable(e.item, Date.now()) ||
          isPredictionAlertable(e.item, Date.now()))
          ? [e.item]
          : [],
      )
      if (fresh.length > 0) {
        await this.sendAlerts(db, fresh).catch((error: unknown) =>
          console.error('Alerts failed', {
            gameId: game.gameId,
            error: String(error),
          }),
        )
      }
    }
  }

  /**
   * Deliver Alerts for this Game, at most ALERTS_PER_WINDOW per Viewer per
   * ALERT_WINDOW_MS so a blowout can't buzz anyone endlessly; Finals always
   * go through.
   */
  private async sendAlerts(
    db: Database,
    items: Array<TimelineItem>,
  ): Promise<void> {
    const keys = vapidKeys(this.env)
    if (!keys) return
    const log =
      (await this.ctx.storage.get<Record<string, Array<number>>>(
        ALERT_LOG_KEY,
      )) ?? {}
    const now = Date.now()
    const allow = (viewerId: string, final: boolean) => {
      const recent = (log[viewerId] ?? []).filter(
        (t) => now - t < ALERT_WINDOW_MS,
      )
      if (!final && recent.length >= ALERTS_PER_WINDOW)
        return Promise.resolve(false)
      log[viewerId] = [...recent, now]
      return Promise.resolve(true)
    }
    const result = await deliverAlerts(db, keys, items, allow)
    await this.ctx.storage.put(ALERT_LOG_KEY, log)
    if (result.sent > 0 || result.pruned > 0) console.log('Alerts sent', result)
  }
}

function storedBox(
  box: SourceBox | null,
  ids: ReadonlyMap<string, string>,
): GameBox | null {
  if (!box) return null
  return {
    linescore: box.linescore,
    tables: box.tables.map((t) => ({
      ...t,
      rows: t.rows.map((r) => ({
        ...r,
        player: { id: ids.get(r.player.sourceId) ?? null, name: r.player.name },
      })),
    })),
  }
}

/** Columns an upsert may overwrite (everything but the identity columns). */
const UPDATABLE_COLUMNS = [
  'sequence',
  'occurred_at',
  'segment_label',
  'side',
  'away_score',
  'home_score',
  'description',
  'play_type',
  'significance',
  'milestone',
  'revised_at',
  'players',
  'detail',
] as const
