import { describe, expect, it } from 'vitest'
import { nextPollDelay } from '@/lib/live/pacing'

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
