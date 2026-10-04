/**
 * Kalshi's Trade API, read-only (docs/adr/0003). Every request is signed
 * with a Viewer's key, market data (prices, games, players, combo legs)
 * included: Kalshi rejects unsigned requests from Cloudflare's shared
 * addresses with 429, while signed ones count against that Viewer's own
 * rate limit. Requests are paced well under Kalshi's basic tier (about 20
 * a second). Prices are dollar strings ("0.3400"), counts fixed-point
 * strings ("10.00").
 */

import { signMessage } from './keys'
import type { SigningKey } from './keys'
import { fetchWithRetry } from '@/lib/sources/pool'

export const KALSHI_HOST = 'https://api.elections.kalshi.com'
const PREFIX = '/trade-api/v2'

export interface KalshiAccount {
  keyId: string
  signer: SigningKey
}

export class KalshiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function read<T>(res: Response, path: string): Promise<T> {
  if (!res.ok) {
    throw new KalshiError(res.status, `Kalshi ${res.status} for ${path}`)
  }
  return (await res.json()) as T
}

/** At least this long between Kalshi requests from one isolate. */
const MIN_GAP_MS = 120
let nextSlot = 0

async function pace(): Promise<void> {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + MIN_GAP_MS
  if (at > now) await new Promise((r) => setTimeout(r, at - now))
}

/** A signed read, of the Viewer's account or of market data. */
export async function signedGet<T>(
  account: KalshiAccount,
  path: string,
): Promise<T> {
  await pace()
  const timestamp = String(Date.now())
  // Kalshi signs timestamp + method + path, without the query string.
  const signature = await signMessage(
    account.signer,
    `${timestamp}GET${PREFIX}${path.split('?')[0]}`,
  )
  const res = await fetchWithRetry(`${KALSHI_HOST}${PREFIX}${path}`, {
    headers: {
      accept: 'application/json',
      'KALSHI-ACCESS-KEY': account.keyId,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': signature,
    },
  })
  return read<T>(res, path)
}

// ─── Shapes (loose: every field may be absent) ─────────────────────────────

export interface KalshiApiKey {
  api_key_id: string
  name?: string
  scopes?: Array<string>
}

export interface KalshiMarketPosition {
  ticker: string
  /** Positive: YES contracts; negative: NO. */
  position_fp?: string
  market_exposure_dollars?: string
  total_traded_dollars?: string
  realized_pnl_dollars?: string
  fees_paid_dollars?: string
  last_updated_ts?: string
}

export interface KalshiSettlement {
  ticker: string
  event_ticker?: string
  market_result?: string
  yes_count_fp?: string
  yes_total_cost_dollars?: string
  no_count_fp?: string
  no_total_cost_dollars?: string
  /** Integer cents. */
  revenue?: number
  /** Payout of one YES contract, in cents (null for most binary markets). */
  value?: number | null
  fee_cost?: string
  settled_time?: string
}

export interface KalshiLeg {
  event_ticker: string
  market_ticker: string
  side: 'yes' | 'no'
}

export interface KalshiMarket {
  ticker: string
  event_ticker: string
  title?: string
  yes_sub_title?: string
  no_sub_title?: string
  status?: string
  result?: string
  yes_bid_dollars?: string
  yes_ask_dollars?: string
  last_price_dollars?: string
  custom_strike?: Record<string, string>
  floor_strike?: number
  strike_type?: string
  mve_collection_ticker?: string
  mve_selected_legs?: Array<KalshiLeg>
  close_time?: string
}

export interface KalshiMilestone {
  id: string
  type?: string
  title?: string
  start_date?: string
  details?: {
    league?: string
    home_team_id?: string
    away_team_id?: string
    status?: string
  }
}

export interface KalshiTarget {
  id: string
  name?: string
  type?: string
  details?: {
    abbreviation?: string
    team_name?: string
    first_name?: string
    last_name?: string
    team_id?: string
    league?: string
  }
}

// ─── Reads ─────────────────────────────────────────────────────────────────

/** The account's API keys, with their scopes (to check a key is read-only). */
export async function apiKeys(
  account: KalshiAccount,
): Promise<Array<KalshiApiKey>> {
  const r = await signedGet<{ api_keys?: Array<KalshiApiKey> }>(
    account,
    '/api_keys',
  )
  return r.api_keys ?? []
}

/** Every open position, across pages. */
export async function openPositions(
  account: KalshiAccount,
): Promise<Array<KalshiMarketPosition>> {
  const out: Array<KalshiMarketPosition> = []
  let cursor = ''
  for (let page = 0; page < 20; page++) {
    const r = await signedGet<{
      market_positions?: Array<KalshiMarketPosition>
      cursor?: string
    }>(
      account,
      `/portfolio/positions?limit=1000&count_filter=position${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    )
    out.push(...(r.market_positions ?? []))
    cursor = r.cursor ?? ''
    if (!cursor) break
  }
  return out
}

/** Recent settlements (a few pages: enough for history going forward). */
export async function recentSettlements(
  account: KalshiAccount,
  pages = 3,
): Promise<Array<KalshiSettlement>> {
  const out: Array<KalshiSettlement> = []
  let cursor = ''
  for (let page = 0; page < pages; page++) {
    const r = await signedGet<{
      settlements?: Array<KalshiSettlement>
      cursor?: string
    }>(
      account,
      `/portfolio/settlements?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    )
    out.push(...(r.settlements ?? []))
    cursor = r.cursor ?? ''
    if (!cursor) break
  }
  return out
}

export async function market(
  account: KalshiAccount,
  ticker: string,
): Promise<KalshiMarket | null> {
  try {
    const r = await signedGet<{ market: KalshiMarket }>(
      account,
      `/markets/${encodeURIComponent(ticker)}`,
    )
    return r.market
  } catch (error) {
    // Some combos only answer the list endpoint.
    if (error instanceof KalshiError && error.status === 404) {
      return (await markets(account, [ticker]))[0] ?? null
    }
    throw error
  }
}

/** Prices for many markets at once (Kalshi takes a comma-joined list). */
export async function markets(
  account: KalshiAccount,
  tickers: ReadonlyArray<string>,
): Promise<Array<KalshiMarket>> {
  const out: Array<KalshiMarket> = []
  for (let i = 0; i < tickers.length; i += 50) {
    const part = tickers.slice(i, i + 50)
    const r = await signedGet<{ markets?: Array<KalshiMarket> }>(
      account,
      `/markets?limit=${part.length}&tickers=${part.map(encodeURIComponent).join(',')}`,
    )
    out.push(...(r.markets ?? []))
  }
  return out
}

/** The real-world game behind an event (its milestone), if Kalshi has one. */
export async function milestoneFor(
  account: KalshiAccount,
  eventTicker: string,
): Promise<KalshiMilestone | null> {
  const r = await signedGet<{ milestones?: Array<KalshiMilestone> }>(
    account,
    `/milestones?limit=1&related_event_ticker=${encodeURIComponent(eventTicker)}`,
  )
  return r.milestones?.[0] ?? null
}

export async function target(
  account: KalshiAccount,
  id: string,
): Promise<KalshiTarget | null> {
  const r = await signedGet<{ structured_target?: KalshiTarget }>(
    account,
    `/structured_targets/${encodeURIComponent(id)}`,
  )
  return r.structured_target ?? null
}
