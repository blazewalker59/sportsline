/**
 * Keeping Viewers' Predictions current (CONTEXT.md, "Prediction"). Server
 * only: run by the Scheduler, and once when a Viewer connects.
 *
 * - syncAccount: the Viewer's open positions and recent settlements become
 *   Predictions, each with its Legs matched to our Games, Teams, Players.
 * - refreshPrices: every watched market's latest prices, and a point of
 *   history a minute for the Predictions themselves.
 */

import {
  aliasedTable,
  and,
  eq,
  inArray,
  like,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import {
  KalshiError,
  market as fetchMarket,
  markets as fetchMarkets,
  target as fetchTarget,
  milestoneFor,
  openPositions,
  recentSettlements,
} from './client'
import { importSigningKey } from './keys'
import {
  findGame,
  kalshiTeamKey,
  leagueOf,
  normalizePlayerName,
  teamMatches,
} from './match'
import { unseal } from './vault'
import type { KalshiAccount, KalshiLeg, KalshiMarket } from './client'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { League } from '@/lib/model/types'
import { dbFromD1 } from '@/lib/db'
import {
  games,
  kalshiAccounts,
  kalshiEvents,
  kalshiMarkets,
  kalshiPrices,
  kalshiTargets,
  players,
  predictionLegs,
  predictions,
  teams,
} from '@/lib/db/schema'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'
import { syncLeague } from '@/lib/live/schedule'

/** Look again for a Game we couldn't match after this long. */
const RECHECK_MS = 30 * 60_000
/** Store a future Game's schedule this far ahead, to match it early. */
const LOOKAHEAD_DAYS = 10
/** New settled Predictions taken per sync (history fills in over runs). */
const SETTLED_PER_RUN = 40
/** Settled Predictions this recent are matched to Games; older aren't. */
const MATCH_SETTLED_MS = 14 * 86_400_000

const dollars = (v: string | undefined): number => Number(v ?? 0) || 0

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

// ─── Matching (cached in kalshi_events / kalshi_targets) ───────────────────

async function targetName(
  account: KalshiAccount,
  db: Database,
  id: string,
): Promise<{ name: string; league: string | null } | null> {
  const cached = await db
    .select()
    .from(kalshiTargets)
    .where(eq(kalshiTargets.id, id))
    .get()
  if (cached) return cached
  const t = await fetchTarget(account, id)
  if (!t) return null
  const name = t.type?.endsWith('_player')
    ? [t.details?.first_name, t.details?.last_name].filter(Boolean).join(' ') ||
      (t.name ?? '')
    : kalshiTeamKey(t.name, t.details?.team_name)
  const row = {
    id,
    type: t.type ?? 'unknown',
    name,
    league: t.details?.league ?? null,
  }
  await db.insert(kalshiTargets).values(row).onConflictDoNothing()
  return row
}

/** Our Game for a Kalshi event, matching (and remembering) it if we can. */
async function gameFor(
  env: CloudflareEnv,
  account: KalshiAccount,
  db: Database,
  eventTicker: string,
): Promise<{ gameId: string | null; league: League | null }> {
  const now = Date.now()
  let cached = await db
    .select()
    .from(kalshiEvents)
    .where(eq(kalshiEvents.eventTicker, eventTicker))
    .get()
  if (cached?.gameId) return { gameId: cached.gameId, league: cached.league }
  if (cached && now - Date.parse(cached.checkedAt) < RECHECK_MS) {
    return { gameId: null, league: cached.league }
  }
  if (!cached) {
    const ms = await milestoneFor(account, eventTicker)
    const [home, away] = await Promise.all([
      ms?.details?.home_team_id
        ? targetName(account, db, ms.details.home_team_id)
        : null,
      ms?.details?.away_team_id
        ? targetName(account, db, ms.details.away_team_id)
        : null,
    ])
    cached = {
      eventTicker,
      milestoneId: ms?.id ?? null,
      league: leagueOf(ms?.details?.league),
      startsAt: ms?.start_date ?? null,
      homeName: home?.name ?? null,
      awayName: away?.name ?? null,
      gameId: null,
      checkedAt: new Date(now).toISOString(),
    }
  }
  let gameId: string | null = null
  const { league, startsAt, homeName, awayName } = cached
  if (league && startsAt && homeName && awayName) {
    const day = sportsDayOf(new Date(startsAt))
    const find = async () => {
      const home = aliasedTable(teams, 'home')
      const away = aliasedTable(teams, 'away')
      const rows = await db
        .select({
          id: games.id,
          startsAt: games.startsAt,
          homeName: home.name,
          awayName: away.name,
        })
        .from(games)
        .innerJoin(home, eq(home.id, games.homeTeamId))
        .innerJoin(away, eq(away.id, games.awayTeamId))
        .where(
          and(
            eq(games.league, league),
            inArray(games.sportsDay, [
              shiftSportsDay(day, -1),
              day,
              shiftSportsDay(day, 1),
            ]),
          ),
        )
      return findGame(rows, { homeKey: homeName, awayKey: awayName, startsAt })
    }
    gameId = await find()
    const ahead = Date.parse(startsAt) - now
    if (!gameId && ahead < LOOKAHEAD_DAYS * 86_400_000) {
      // Not stored yet (a future day, or one never browsed): store that
      // day's schedule for the League, then look again.
      await syncLeague(env, league, day, new Date(now)).catch(() => {})
      gameId = await find()
    }
  }
  const row = { ...cached, gameId, checkedAt: new Date(now).toISOString() }
  await db
    .insert(kalshiEvents)
    .values(row)
    .onConflictDoUpdate({
      target: kalshiEvents.eventTicker,
      set: { gameId: row.gameId, checkedAt: row.checkedAt },
    })
  return { gameId, league }
}

/** Our Team or Player a leg's market is about, from its custom strike. */
async function subjectFor(
  account: KalshiAccount,
  db: Database,
  m: KalshiMarket | undefined,
  league: League | null,
  gameId: string | null,
): Promise<{ teamId: string | null; playerId: string | null }> {
  const strike = m?.custom_strike ?? {}
  const playerTarget = Object.entries(strike).find(([k]) =>
    k.endsWith('_player'),
  )?.[1]
  const teamTarget = Object.entries(strike).find(([k]) =>
    k.endsWith('_team'),
  )?.[1]
  let playerId: string | null = null
  let teamId: string | null = null
  if (playerTarget && league) {
    const t = await targetName(account, db, playerTarget)
    if (t) {
      const want = normalizePlayerName(t.name)
      const last = t.name.trim().split(/\s+/).at(-1) ?? ''
      const rows = await db
        .select({ id: players.id, name: players.name })
        .from(players)
        .where(and(eq(players.league, league), endsWithWord(last)))
      playerId =
        rows.find((p) => normalizePlayerName(p.name) === want)?.id ?? null
    }
  }
  if (teamTarget && gameId) {
    const t = await targetName(account, db, teamTarget)
    const game = await db
      .select({ home: games.homeTeamId, away: games.awayTeamId })
      .from(games)
      .where(eq(games.id, gameId))
      .get()
    if (t && game) {
      const named = await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, [game.home, game.away]))
      teamId = named.find((x) => teamMatches(t.name, x.name))?.id ?? null
    }
  }
  return { teamId, playerId }
}

/** Players whose name has this word (narrows the exact name comparison). */
function endsWithWord(lastWord: string) {
  // SQLite LIKE is case-insensitive for ASCII.
  return or(eq(players.name, lastWord), like(players.name, `% ${lastWord}%`))
}

// ─── Predictions ────────────────────────────────────────────────────────────

function predictionId(viewerId: string, ticker: string): string {
  return `${viewerId}~${ticker}`
}

/** Store a market's latest prices and title. */
async function rememberMarkets(
  db: Database,
  list: ReadonlyArray<KalshiMarket>,
): Promise<void> {
  const now = new Date().toISOString()
  for (let i = 0; i < list.length; i += 10) {
    const part = list.slice(i, i + 10)
    await db
      .insert(kalshiMarkets)
      .values(
        part.map((m) => ({
          ticker: m.ticker,
          eventTicker: m.event_ticker,
          title: m.title ?? m.ticker,
          yesBid: m.yes_bid_dollars ? dollars(m.yes_bid_dollars) : null,
          yesAsk: m.yes_ask_dollars ? dollars(m.yes_ask_dollars) : null,
          lastPrice: m.last_price_dollars
            ? dollars(m.last_price_dollars)
            : null,
          floorStrike:
            typeof m.floor_strike === 'number' ? m.floor_strike : null,
          status: m.status ?? null,
          result: m.result ?? null,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: kalshiMarkets.ticker,
        set: {
          title: sqlExcluded('title'),
          yesBid: sqlExcluded('yes_bid'),
          yesAsk: sqlExcluded('yes_ask'),
          lastPrice: sqlExcluded('last_price'),
          floorStrike: sqlExcluded('floor_strike'),
          status: sqlExcluded('status'),
          result: sqlExcluded('result'),
          updatedAt: sqlExcluded('updated_at'),
        },
      })
  }
}

const sqlExcluded = (column: string) => sql.raw(`excluded.${column}`)

/** A leg's readable title: a game winner reads as the team. */
function legTitle(m: KalshiMarket | undefined, fallback: string): string {
  return m?.title ?? m?.yes_sub_title ?? fallback
}

/** Save a Prediction for a market, with its Legs (created or refreshed). Exported for scripts and tests. */
export async function savePrediction(
  env: CloudflareEnv,
  account: KalshiAccount,
  db: Database,
  viewerId: string,
  m: KalshiMarket,
  fields: {
    side: 'yes' | 'no'
    contracts: number
    cost: number
    status: 'open' | 'settled'
    result?: 'won' | 'lost' | 'void' | null
    payout?: number | null
    pnl?: number | null
    settledAt?: string | null
    /** Match Legs to our Games and Players (skipped for old history). */
    match?: boolean
  },
): Promise<void> {
  const id = predictionId(viewerId, m.ticker)
  const combo = (m.mve_selected_legs?.length ?? 0) > 0
  const legs: Array<KalshiLeg> = combo
    ? m.mve_selected_legs!
    : [
        {
          event_ticker: m.event_ticker,
          market_ticker: m.ticker,
          side: fields.side,
        },
      ]
  const legMarkets = combo
    ? await fetchMarkets(
        account,
        legs.map((l) => l.market_ticker),
      )
    : [m]
  await rememberMarkets(db, [m, ...(combo ? legMarkets : [])])
  const byTicker = new Map(legMarkets.map((x) => [x.ticker, x]))
  const now = new Date().toISOString()
  await db
    .insert(predictions)
    .values({
      id,
      viewerId,
      marketTicker: m.ticker,
      kind: combo ? 'combo' : 'single',
      side: fields.side,
      // A Combo reads as its Legs: "Washington wins · Not: Taylor 70+…".
      title: combo
        ? legs
            .map(
              (l) =>
                `${l.side === 'no' ? 'Not: ' : ''}${legTitle(byTicker.get(l.market_ticker), l.market_ticker)}`,
            )
            .join(' · ')
        : legTitle(m, m.ticker),
      contracts: fields.contracts,
      cost: fields.cost,
      status: fields.status,
      result: fields.result ?? null,
      payout: fields.payout ?? null,
      pnl: fields.pnl ?? null,
      openedAt: now,
      settledAt: fields.settledAt ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: predictions.id,
      set: {
        title: sqlExcluded('title'),
        side: fields.side,
        contracts: fields.contracts,
        cost: fields.cost,
        status: fields.status,
        result: fields.result ?? null,
        payout: fields.payout ?? null,
        pnl: fields.pnl ?? null,
        settledAt: fields.settledAt ?? null,
        updatedAt: now,
      },
    })
  const rows = []
  for (const [position, leg] of legs.entries()) {
    const lm = byTicker.get(leg.market_ticker)
    const matched =
      fields.match === false
        ? { gameId: null, league: null }
        : await gameFor(env, account, db, leg.event_ticker)
    const { gameId, league } = matched
    const { teamId, playerId } =
      fields.match === false
        ? { teamId: null, playerId: null }
        : await subjectFor(account, db, lm, league, gameId)
    rows.push({
      predictionId: id,
      position,
      marketTicker: leg.market_ticker,
      eventTicker: leg.event_ticker,
      side: leg.side,
      title: legTitle(lm, leg.market_ticker),
      gameId,
      teamId,
      playerId,
    })
  }
  if (rows.length > 0) {
    await db
      .insert(predictionLegs)
      .values(rows)
      .onConflictDoUpdate({
        target: [predictionLegs.predictionId, predictionLegs.position],
        set: {
          title: sqlExcluded('title'),
          gameId: sqlExcluded('game_id'),
          teamId: sqlExcluded('team_id'),
          playerId: sqlExcluded('player_id'),
        },
      })
  }
}

/** Bring one Viewer's Predictions up to date from their Kalshi account. */
export async function syncAccount(
  env: CloudflareEnv,
  viewerId: string,
): Promise<{ open: number; settled: number }> {
  const db = dbFromD1(env.DB)
  const account = await loadAccount(env, viewerId)
  if (!account) return { open: 0, settled: 0 }
  try {
    const [positions, settlements] = await Promise.all([
      openPositions(account),
      recentSettlements(account),
    ])
    const held = positions.filter((p) => dollars(p.position_fp) !== 0)
    const known = new Map(
      (
        await db
          .select({
            ticker: predictions.marketTicker,
            status: predictions.status,
          })
          .from(predictions)
          .where(eq(predictions.viewerId, viewerId))
      ).map((r) => [r.ticker, r.status]),
    )

    // A rate limit mid-sync stops it here: what's left waits for the next
    // run rather than failing the whole sync. Any other trouble with one
    // Prediction is logged and the rest carry on.
    let limited = false
    const each = async (what: string, save: () => Promise<void>) => {
      if (limited) return false
      try {
        await save()
        return true
      } catch (error) {
        if (error instanceof KalshiError && error.status === 429) {
          limited = true
        } else {
          console.error('Kalshi prediction failed', {
            what,
            error: String(error),
          })
        }
        return false
      }
    }

    // Open positions.
    const heldMarkets = new Map(
      (
        await fetchMarkets(
          account,
          held.map((p) => p.ticker),
        )
      ).map((m) => [m.ticker, m]),
    )
    for (const p of held) {
      await each(p.ticker, async () => {
        const m =
          heldMarkets.get(p.ticker) ?? (await fetchMarket(account, p.ticker))
        if (!m) return
        const position = dollars(p.position_fp)
        await savePrediction(env, account, db, viewerId, m, {
          side: position > 0 ? 'yes' : 'no',
          contracts: Math.abs(position),
          cost: dollars(p.market_exposure_dollars),
          status: 'open',
        })
      })
    }

    // Settled ones new to us (or that we had as open), a few per run so a
    // long history fills in over several syncs. Only recent ones are
    // matched to Games: old history just keeps its result.
    const fresh = settlements
      .filter((s) => known.get(s.ticker) !== 'settled')
      .slice(0, SETTLED_PER_RUN)
    const settledMarkets = new Map(
      (
        await fetchMarkets(
          account,
          fresh.map((s) => s.ticker),
        )
      ).map((m) => [m.ticker, m]),
    )
    let settledCount = 0
    for (const s of fresh) {
      const saved = await each(s.ticker, async () => {
        const m =
          settledMarkets.get(s.ticker) ?? (await fetchMarket(account, s.ticker))
        if (!m) return
        const yes = dollars(s.yes_count_fp)
        const no = dollars(s.no_count_fp)
        const side: 'yes' | 'no' = yes >= no ? 'yes' : 'no'
        const cost =
          dollars(s.yes_total_cost_dollars) + dollars(s.no_total_cost_dollars)
        const payout = (s.revenue ?? 0) / 100
        const result =
          s.market_result === side
            ? 'won'
            : s.market_result === 'yes' || s.market_result === 'no'
              ? 'lost'
              : 'void'
        const settledAt = s.settled_time ?? new Date().toISOString()
        await savePrediction(env, account, db, viewerId, m, {
          side,
          contracts: Math.max(yes, no),
          cost,
          status: 'settled',
          result,
          payout,
          pnl: payout - cost - dollars(s.fee_cost),
          settledAt,
          match: Date.now() - Date.parse(settledAt) < MATCH_SETTLED_MS,
        })
      })
      if (saved) settledCount++
    }

    // Open Predictions no longer held and not settled were sold: closed.
    const stillHeld = new Set(held.map((p) => p.ticker))
    const settledNow = new Set(settlements.map((s) => s.ticker))
    const gone = [...known]
      .filter(
        ([ticker, status]) =>
          status === 'open' &&
          !stillHeld.has(ticker) &&
          !settledNow.has(ticker),
      )
      .map(([ticker]) => predictionId(viewerId, ticker))
    for (let i = 0; i < gone.length; i += 80) {
      await db
        .update(predictions)
        .set({ status: 'closed', updatedAt: new Date().toISOString() })
        .where(inArray(predictions.id, gone.slice(i, i + 80)))
    }

    await db
      .update(kalshiAccounts)
      .set({
        status: 'ok',
        lastError: limited
          ? 'Kalshi asked us to slow down; the rest syncs shortly.'
          : null,
        syncedAt: new Date().toISOString(),
      })
      .where(eq(kalshiAccounts.viewerId, viewerId))
    return { open: held.length, settled: settledCount }
  } catch (error) {
    await db
      .update(kalshiAccounts)
      .set({
        status: 'error',
        lastError: String(error).slice(0, 300),
        syncedAt: new Date().toISOString(),
      })
      .where(eq(kalshiAccounts.viewerId, viewerId))
    throw error
  }
}

/** Accounts due a sync (not synced in `everyMs`), oldest first. */
export async function accountsDue(
  env: Pick<CloudflareEnv, 'DB'>,
  everyMs: number,
  limit: number,
): Promise<Array<string>> {
  const cutoff = new Date(Date.now() - everyMs).toISOString()
  const rows = await dbFromD1(env.DB)
    .select({ viewerId: kalshiAccounts.viewerId })
    .from(kalshiAccounts)
    .where(
      or(
        sql`${kalshiAccounts.syncedAt} is null`,
        lt(kalshiAccounts.syncedAt, cutoff),
      ),
    )
    .orderBy(kalshiAccounts.syncedAt)
    .limit(limit)
  return rows.map((r) => r.viewerId)
}

/**
 * Latest prices for every market an open Prediction depends on, plus a
 * point of history a minute for each Prediction's own market. Each
 * Viewer's markets are read with their own key (see client.ts).
 */
export async function refreshPrices(
  env: Pick<CloudflareEnv, 'DB' | 'KALSHI_ENCRYPTION_KEY'>,
): Promise<number> {
  const db = dbFromD1(env.DB)
  const open = await db
    .select({
      ticker: predictions.marketTicker,
      id: predictions.id,
      viewerId: predictions.viewerId,
    })
    .from(predictions)
    .where(eq(predictions.status, 'open'))
  if (open.length === 0) return 0
  // In parts: D1 binds at most 100 parameters.
  const legs: Array<{ ticker: string; predictionId: string }> = []
  for (let i = 0; i < open.length; i += 80) {
    legs.push(
      ...(await db
        .select({
          ticker: predictionLegs.marketTicker,
          predictionId: predictionLegs.predictionId,
        })
        .from(predictionLegs)
        .where(
          inArray(
            predictionLegs.predictionId,
            open.slice(i, i + 80).map((o) => o.id),
          ),
        )),
    )
  }
  const at = new Date().toISOString().slice(0, 16)
  const own = new Set(open.map((o) => o.ticker))
  const done = new Set<string>()
  let count = 0
  for (const viewerId of new Set(open.map((o) => o.viewerId))) {
    const ids = new Set(
      open.filter((o) => o.viewerId === viewerId).map((o) => o.id),
    )
    const tickers = [
      ...new Set([
        ...open.filter((o) => ids.has(o.id)).map((o) => o.ticker),
        ...legs.filter((l) => ids.has(l.predictionId)).map((l) => l.ticker),
      ]),
    ].filter((t) => !done.has(t))
    if (tickers.length === 0) continue
    const account = await loadAccount(env, viewerId).catch(() => null)
    if (!account) continue
    const latest = await fetchMarkets(account, tickers).catch(
      (error: unknown) => {
        console.error('Kalshi prices failed', { error: String(error) })
        return []
      },
    )
    await rememberMarkets(db, latest)
    for (const m of latest) done.add(m.ticker)
    const points = latest
      .filter((m) => own.has(m.ticker))
      .map((m) => ({ ticker: m.ticker, at, chance: chanceOf(m) }))
      .filter(
        (p): p is { ticker: string; at: string; chance: number } =>
          p.chance !== null,
      )
    for (let i = 0; i < points.length; i += 30) {
      await db
        .insert(kalshiPrices)
        .values(points.slice(i, i + 30))
        .onConflictDoNothing()
    }
    count += latest.length
  }
  return count
}

/** A market's YES chance (0–1): the bid/ask midpoint, else the last price. */
export function chanceOf(m: KalshiMarket): number | null {
  const bid = m.yes_bid_dollars ? dollars(m.yes_bid_dollars) : null
  const ask = m.yes_ask_dollars ? dollars(m.yes_ask_dollars) : null
  if (bid !== null && ask !== null && ask > 0) return (bid + ask) / 2
  return m.last_price_dollars ? dollars(m.last_price_dollars) : null
}

/** Drop price history for markets no open Prediction watches any more. */
export async function pruneHistory(
  env: Pick<CloudflareEnv, 'DB'>,
): Promise<void> {
  const db = dbFromD1(env.DB)
  const watched = db
    .select({ ticker: predictions.marketTicker })
    .from(predictions)
    .where(ne(predictions.status, 'closed'))
  await db
    .delete(kalshiPrices)
    .where(sql`${kalshiPrices.ticker} not in ${watched}`)
}
