/**
 * How often a LiveGame polls its Source (docs/adr/0001: ~5–10s behind the
 * Source while live). Pure.
 */

import type { GameStatus } from '@/lib/model/types'

const MIN_LIVE_SECONDS = 5
const MAX_LIVE_SECONDS = 15
const WAITING_SECONDS = 60
/** Pre-game, a LiveGame wakes this long before first pitch/puck/tip. */
export const WARMUP_MINUTES = 15

/** Milliseconds until the next poll, or null to stop polling. */
export function nextPollDelay(
  status: GameStatus,
  startsAt: string,
  now: Date,
  hintSeconds?: number,
): number | null {
  switch (status) {
    case 'final':
    case 'postponed':
      return null
    case 'delayed':
      return WAITING_SECONDS * 1000
    case 'live': {
      const s = Math.min(
        MAX_LIVE_SECONDS,
        Math.max(MIN_LIVE_SECONDS, hintSeconds ?? MIN_LIVE_SECONDS),
      )
      return s * 1000
    }
    case 'scheduled': {
      const untilWarmup =
        Date.parse(startsAt) - WARMUP_MINUTES * 60_000 - now.getTime()
      // Too early: stop, and let the schedule cron wake the Game later.
      return untilWarmup > 0 ? null : WAITING_SECONDS * 1000
    }
  }
}

const RETRY_SECONDS = 30
const RATE_LIMITED_RETRY_SECONDS = 60
/** A Source's rate limit clears itself; only one that lasts this long is reported. */
export const RATE_LIMIT_GRACE_MS = 15 * 60_000

/** Did a Source answer 429 (Too Many Requests)? */
export function isRateLimited(error: unknown): boolean {
  return /\b429\b/.test(String(error))
}

/**
 * After a failed poll: when to try again, and whether the failure is worth
 * reporting. `rateLimitedSince` is when the current run of 429s began, or
 * null when this failure isn't one.
 */
export function retryAfterFailure(
  rateLimitedSince: number | null,
  now: number,
): { delayMs: number; report: boolean } {
  if (rateLimitedSince === null) {
    return { delayMs: RETRY_SECONDS * 1000, report: true }
  }
  return {
    delayMs: RATE_LIMITED_RETRY_SECONDS * 1000,
    report: now - rateLimitedSince >= RATE_LIMIT_GRACE_MS,
  }
}

const SCHEDULE_INTERVAL_MS = 60_000

/** The Scheduler's next run: the next whole minute after `now`, epoch ms. */
export function nextMinute(now: number): number {
  return (Math.floor(now / SCHEDULE_INTERVAL_MS) + 1) * SCHEDULE_INTERVAL_MS
}
