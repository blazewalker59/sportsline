/**
 * Kalshi over HTTP for the signed-in Viewer: connect a read-only key,
 * disconnect, sync now, and read Predictions with their Odds (CONTEXT.md).
 */

import { createServerFn } from '@tanstack/react-start'
import { aliasedTable, and, desc, eq, gte, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { KalshiError, apiKeys } from './client'
import { importSigningKey } from './keys'
import { isReadOnly } from './scopes'
import { progressOf } from './props'
import { refreshPrices, syncAccount } from './sync'
import { seal } from './vault'
import type { Progress } from './props'
import type { GameSummary } from '@/lib/model/timeline'
import { getCloudflareEnv } from '@/lib/db'
import {
  games,
  kalshiAccounts,
  kalshiMarkets,
  kalshiPrices,
  players,
  predictionLegs,
  predictions,
  teams,
} from '@/lib/db/schema'
import { toGameSummary } from '@/lib/live/rows'
import { sessionViewer, withViewer } from '@/lib/viewer/session'

export interface KalshiConnection {
  keyId: string
  status: 'ok' | 'error'
  lastError: string | null
  syncedAt: string | null
}

export interface LegView {
  title: string
  side: 'yes' | 'no'
  /** The chance this Leg goes the Viewer's way (0–1), if priced. */
  chance: number | null
  status: 'pending' | 'won' | 'lost'
  game: GameSummary | null
  playerId: string | null
  playerName: string | null
  teamId: string | null
  /** A stat prop's count so far against its line (212 of 300 rec yds). */
  progress: Progress | null
}

export interface PredictionView {
  id: string
  kind: 'single' | 'combo'
  side: 'yes' | 'no'
  title: string
  contracts: number
  cost: number
  status: 'open' | 'settled' | 'closed'
  result: 'won' | 'lost' | 'void' | null
  payout: number | null
  pnl: number | null
  openedAt: string
  settledAt: string | null
  /** The chance of the Viewer's side now (0–1), if priced. */
  chance: number | null
  /** The chance they got in at: what they paid per contract. */
  entryChance: number | null
  /** What the position would sell for now (dollars), if priced. */
  value: number | null
  /** The Viewer's side's chance over the last day, oldest first. */
  history: Array<{ at: string; chance: number }>
  legs: Array<LegView>
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
      const sealed = await seal(env.KALSHI_ENCRYPTION_KEY, data.privateKey)
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
      }
      await db
        .insert(kalshiAccounts)
        .values(row)
        .onConflictDoUpdate({ target: kalshiAccounts.viewerId, set: row })
      // First sync now, so Predictions appear straight away.
      try {
        await syncAccount(env, viewerId)
        await refreshPrices(env)
      } catch (error) {
        console.error('First Kalshi sync failed', { error: String(error) })
      }
      return {
        keyId: row.keyId,
        status: 'ok',
        lastError: null,
        syncedAt: new Date().toISOString(),
      }
    }),
  )

/** Forget the key and every Prediction read with it. */
export const disconnectKalshi = createServerFn({ method: 'POST' }).handler(() =>
  withViewer(async ({ db, viewerId }) => {
    await db.delete(predictions).where(eq(predictions.viewerId, viewerId))
    await db.delete(kalshiAccounts).where(eq(kalshiAccounts.viewerId, viewerId))
  }),
)

export const syncKalshiNow = createServerFn({ method: 'POST' }).handler(() =>
  withViewer(async ({ viewerId }) => {
    const env = getCloudflareEnv()
    const counts = await syncAccount(env, viewerId)
    await refreshPrices(env)
    return counts
  }),
)

const HISTORY_MS = 24 * 3_600_000
const SETTLED_SHOWN = 100

export const getPredictions = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<PredictionView>> => {
    const viewer = await sessionViewer()
    if (!viewer) return []
    return withViewer(async ({ db, viewerId }) => {
      const [open, settled] = await Promise.all([
        db
          .select()
          .from(predictions)
          .where(
            and(
              eq(predictions.viewerId, viewerId),
              eq(predictions.status, 'open'),
            ),
          )
          .orderBy(desc(predictions.openedAt)),
        db
          .select()
          .from(predictions)
          .where(
            and(
              eq(predictions.viewerId, viewerId),
              inArray(predictions.status, ['settled', 'closed']),
            ),
          )
          .orderBy(desc(predictions.settledAt), desc(predictions.updatedAt))
          .limit(SETTLED_SHOWN),
      ])
      const all = [...open, ...settled]
      if (all.length === 0) return []
      const ids = all.map((p) => p.id)

      // In parts: D1 binds at most 100 parameters, and history grows.
      const legs = await inChunks(ids, (part) =>
        db
          .select({
            leg: predictionLegs,
            playerName: players.name,
          })
          .from(predictionLegs)
          .leftJoin(players, eq(players.id, predictionLegs.playerId))
          .where(inArray(predictionLegs.predictionId, part))
          .orderBy(predictionLegs.predictionId, predictionLegs.position),
      )
      const tickers = [
        ...new Set([
          ...all.map((p) => p.marketTicker),
          ...legs.map((l) => l.leg.marketTicker),
        ]),
      ]
      const gameIds = [
        ...new Set(legs.flatMap((l) => (l.leg.gameId ? [l.leg.gameId] : []))),
      ]
      const away = aliasedTable(teams, 'away')
      const home = aliasedTable(teams, 'home')
      const [marketRows, gameRows, history] = await Promise.all([
        inChunks(tickers, (part) =>
          db
            .select()
            .from(kalshiMarkets)
            .where(inArray(kalshiMarkets.ticker, part)),
        ),
        inChunks(gameIds, (part) =>
          db
            .select({ game: games, away, home })
            .from(games)
            .innerJoin(away, eq(away.id, games.awayTeamId))
            .innerJoin(home, eq(home.id, games.homeTeamId))
            .where(inArray(games.id, part)),
        ),
        inChunks(
          open.map((p) => p.marketTicker),
          (part) =>
            db
              .select()
              .from(kalshiPrices)
              .where(
                and(
                  inArray(kalshiPrices.ticker, part),
                  gte(
                    kalshiPrices.at,
                    new Date(Date.now() - HISTORY_MS)
                      .toISOString()
                      .slice(0, 16),
                  ),
                ),
              )
              .orderBy(kalshiPrices.at),
        ),
      ])
      const marketBy = new Map(marketRows.map((m) => [m.ticker, m]))
      const gameBy = new Map(
        gameRows.map((r) => [r.game.id, toGameSummary(r.game, r.away, r.home)]),
      )
      const boxBy = new Map(gameRows.map((r) => [r.game.id, r.game.box]))
      const yesChance = (ticker: string): number | null => {
        const m = marketBy.get(ticker)
        if (!m) return null
        if (m.yesBid !== null && m.yesAsk !== null && m.yesAsk > 0)
          return (m.yesBid + m.yesAsk) / 2
        return m.lastPrice
      }
      const forSide = (chance: number | null, side: 'yes' | 'no') =>
        chance === null ? null : side === 'yes' ? chance : 1 - chance

      return all.map((p): PredictionView => {
        const m = marketBy.get(p.marketTicker)
        const sellPrice =
          p.side === 'yes'
            ? (m?.yesBid ?? null)
            : m?.yesAsk != null
              ? 1 - m.yesAsk
              : null
        return {
          id: p.id,
          kind: p.kind,
          side: p.side,
          title: p.title,
          contracts: p.contracts,
          cost: p.cost,
          status: p.status,
          result: p.result,
          payout: p.payout,
          pnl: p.pnl,
          openedAt: p.openedAt,
          settledAt: p.settledAt,
          chance:
            p.status === 'open'
              ? forSide(yesChance(p.marketTicker), p.side)
              : null,
          entryChance: p.contracts > 0 ? p.cost / p.contracts : null,
          value:
            p.status === 'open' && sellPrice !== null
              ? p.contracts * sellPrice
              : null,
          history: history
            .filter((h) => h.ticker === p.marketTicker)
            .map((h) => ({
              at: h.at,
              chance: p.side === 'yes' ? h.chance : 1 - h.chance,
            })),
          legs: legs
            .filter((l) => l.leg.predictionId === p.id)
            .map(({ leg, playerName }) => {
              const lm = marketBy.get(leg.marketTicker)
              const result = lm?.result
              const game = leg.gameId ? (gameBy.get(leg.gameId) ?? null) : null
              return {
                title: leg.title,
                side: leg.side,
                chance: forSide(yesChance(leg.marketTicker), leg.side),
                status:
                  result === 'yes' || result === 'no'
                    ? result === leg.side
                      ? 'won'
                      : 'lost'
                    : 'pending',
                game,
                playerId: leg.playerId,
                playerName,
                teamId: leg.teamId,
                progress: game
                  ? progressOf({
                      league: game.league,
                      eventTicker: leg.eventTicker,
                      title: leg.title,
                      floorStrike: lm?.floorStrike ?? null,
                      game,
                      box: boxBy.get(game.id) ?? null,
                      teamId: leg.teamId,
                      playerId: leg.playerId,
                    })
                  : null,
              }
            }),
        }
      })
    })
  },
)

/** Run a query over ids in parts (D1 binds at most 100 parameters). */
async function inChunks<T>(
  ids: ReadonlyArray<string>,
  query: (part: Array<string>) => Promise<Array<T>>,
): Promise<Array<T>> {
  const out: Array<T> = []
  for (let i = 0; i < ids.length; i += 80) {
    out.push(...(await query(ids.slice(i, i + 80))))
  }
  return out
}
