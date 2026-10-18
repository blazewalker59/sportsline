/**
 * A limit on how often each API token may call /mcp (docs/adr/0007): a
 * fixed window of requests a minute. Counted in the token's Viewer's
 * ViewerSync Durable Object (one per Viewer, so every Worker sees the
 * same count) in memory: an object idle long enough to be evicted has no
 * window left worth keeping.
 */

import type { Caller } from './tokens'
import type { CloudflareEnv } from '@/lib/db'

export const MCP_REQUESTS_PER_MINUTE = 60
const WINDOW_MS = 60_000

export interface RateWindow {
  start: number
  count: number
}

/**
 * Count one request for `key`: 0 if it's within the limit, else the
 * seconds until the window resets. Updates `windows`.
 */
export function hit(
  windows: Map<string, RateWindow>,
  key: string,
  now: number,
  limit = MCP_REQUESTS_PER_MINUTE,
  windowMs = WINDOW_MS,
): number {
  let w = windows.get(key)
  if (!w || now - w.start >= windowMs) {
    w = { start: now, count: 0 }
    windows.set(key, w)
  }
  w.count++
  return w.count > limit
    ? Math.max(1, Math.ceil((w.start + windowMs - now) / 1000))
    : 0
}

/** Count a request by this caller's token: 0, or the seconds to wait. */
export async function rateLimit(
  env: Pick<CloudflareEnv, 'VIEWER_SYNC'>,
  caller: Pick<Caller, 'viewerId' | 'tokenId'>,
): Promise<number> {
  return env.VIEWER_SYNC.get(
    env.VIEWER_SYNC.idFromName(caller.viewerId),
  ).hitRate(caller.tokenId)
}
