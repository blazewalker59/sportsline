import { describe, expect, it } from 'vitest'
import {
  isRateLimited,
  isTransient,
  nextPollDelay,
  retryAfterFailure,
} from '@/lib/live/pacing'

const now = new Date('2026-10-01T23:00:00Z')

describe('nextPollDelay', () => {
  it('polls live Games at the Source hint, clamped to 5–15s', () => {
    expect(nextPollDelay('live', '', now, 10)).toBe(10_000)
    expect(nextPollDelay('live', '', now, 1)).toBe(5_000)
    expect(nextPollDelay('live', '', now, 60)).toBe(15_000)
    expect(nextPollDelay('live', '', now)).toBe(5_000)
  })

  it('stops for finished or postponed Games', () => {
    expect(nextPollDelay('final', '', now)).toBeNull()
    expect(nextPollDelay('postponed', '', now)).toBeNull()
  })

  it('waits a minute at a time during a delay or the pre-game warmup', () => {
    expect(nextPollDelay('delayed', '', now)).toBe(60_000)
    expect(nextPollDelay('scheduled', '2026-10-01T23:10:00Z', now)).toBe(60_000)
  })

  it('stops for Games that are not close to starting', () => {
    expect(nextPollDelay('scheduled', '2026-10-02T02:00:00Z', now)).toBeNull()
  })
})

describe('retryAfterFailure', () => {
  const t = Date.parse('2026-10-06T23:00:00Z')

  it('retries other failures in 30s and reports them', () => {
    expect(retryAfterFailure(null, t)).toEqual({
      delayMs: 30_000,
      report: true,
    })
  })

  it('waits out a rate limit a minute at a time, reporting only once it lasts 15 minutes', () => {
    expect(retryAfterFailure(t, t)).toEqual({ delayMs: 60_000, report: false })
    expect(retryAfterFailure(t, t + 14 * 60_000).report).toBe(false)
    expect(retryAfterFailure(t, t + 15 * 60_000).report).toBe(true)
  })
})

describe('isRateLimited', () => {
  it('spots a 429 in a Source error', () => {
    expect(isRateLimited(new Error('NHL 429 for https://x/1'))).toBe(true)
    expect(isRateLimited(new Error('NHL 500 for https://x/4290'))).toBe(false)
  })
})

describe('isTransient', () => {
  it('spots timeouts, 5xx and Cloudflare resets, not a refusal', () => {
    const transient = [
      'ESPN timed out after 8000ms for https://x/1',
      'ESPN 525 for https://x/2',
      'Network connection lost.',
      'internal error; reference = c4j8ollpcq8v44nc58kkq2dq',
      'Durable Object storage operation exceeded timeout which caused object to be reset.',
    ]
    for (const m of transient) expect(isTransient(new Error(m))).toBe(true)
    expect(
      isTransient(Object.assign(new Error('Overloaded'), { retryable: true })),
    ).toBe(true)
    expect(isTransient(new Error('ESPN 403 for https://x/500'))).toBe(false)
    expect(isTransient(new Error('Cannot read properties of null'))).toBe(false)
  })
})
