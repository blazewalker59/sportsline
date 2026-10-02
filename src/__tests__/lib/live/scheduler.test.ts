import { describe, expect, it } from 'vitest'
import { nextMinute } from '@/lib/live/pacing'

describe('nextMinute', () => {
  it('lands on the next whole minute', () => {
    expect(nextMinute(Date.parse('2026-10-02T02:20:30.500Z'))).toBe(
      Date.parse('2026-10-02T02:21:00Z'),
    )
  })

  it('never returns the current instant, even on a boundary', () => {
    expect(nextMinute(Date.parse('2026-10-02T02:21:00Z'))).toBe(
      Date.parse('2026-10-02T02:22:00Z'),
    )
  })
})
