import { describe, expect, it } from 'vitest'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'

describe('sportsDayOf', () => {
  it('counts a late West Coast game toward the evening it started', () => {
    // 1:30am ET on Oct 2 is still the Oct 1 Sports Day.
    expect(sportsDayOf(new Date('2026-10-02T05:30:00Z'))).toBe('2026-10-01')
  })

  it('rolls over at 6am Eastern', () => {
    expect(sportsDayOf(new Date('2026-10-02T09:59:00Z'))).toBe('2026-10-01')
    expect(sportsDayOf(new Date('2026-10-02T10:00:00Z'))).toBe('2026-10-02')
  })

  it('follows Eastern standard time in winter', () => {
    expect(sportsDayOf(new Date('2026-12-02T10:59:00Z'))).toBe('2026-12-01')
    expect(sportsDayOf(new Date('2026-12-02T11:00:00Z'))).toBe('2026-12-02')
  })
})

describe('shiftSportsDay', () => {
  it('moves across month boundaries', () => {
    expect(shiftSportsDay('2026-10-01', -1)).toBe('2026-09-30')
    expect(shiftSportsDay('2026-09-30', 1)).toBe('2026-10-01')
  })
})
