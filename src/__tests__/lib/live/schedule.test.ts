import { describe, expect, it } from 'vitest'
import { needsTracking } from '@/lib/live/schedule'

const now = new Date('2026-10-01T23:00:00Z')

describe('needsTracking', () => {
  it('tracks live and delayed Games', () => {
    expect(needsTracking({ status: 'live', startsAt: '' }, 'live', now)).toBe(
      true,
    )
    expect(
      needsTracking({ status: 'delayed', startsAt: '' }, 'live', now),
    ).toBe(true)
  })

  it('wakes scheduled Games only inside the warmup window', () => {
    expect(
      needsTracking(
        { status: 'scheduled', startsAt: '2026-10-01T23:10:00Z' },
        undefined,
        now,
      ),
    ).toBe(true)
    expect(
      needsTracking(
        { status: 'scheduled', startsAt: '2026-10-02T01:00:00Z' },
        undefined,
        now,
      ),
    ).toBe(false)
  })

  it('backfills a finished Game once, then leaves it alone', () => {
    expect(needsTracking({ status: 'final', startsAt: '' }, 'live', now)).toBe(
      true,
    )
    expect(
      needsTracking({ status: 'final', startsAt: '' }, undefined, now),
    ).toBe(true)
    expect(needsTracking({ status: 'final', startsAt: '' }, 'final', now)).toBe(
      false,
    )
  })
})
