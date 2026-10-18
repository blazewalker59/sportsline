import { describe, expect, it } from 'vitest'
import { mlbSeason } from '@/lib/sources/mlb'
import { cfbSeason } from '@/lib/sources/cfb'
import { nhlSeasons } from '@/lib/sources/nhl'
import { seasonYear } from '@/lib/sources/common'

describe('seasonYear', () => {
  it('counts months before the opening one toward the last season', () => {
    expect(seasonYear(new Date('2026-04-30T23:59:59Z'), 4)).toBe(2025)
    expect(seasonYear(new Date('2026-05-01T00:00:00Z'), 4)).toBe(2026)
  })
})

describe("each League's season cutoff", () => {
  it('MLB rolls over in March', () => {
    expect(mlbSeason(new Date('2026-02-28T23:59:59Z'))).toBe(2025)
    expect(mlbSeason(new Date('2026-03-01T00:00:00Z'))).toBe(2026)
    expect(mlbSeason(new Date('2026-12-31T12:00:00Z'))).toBe(2026)
  })

  it('college football rolls over in July', () => {
    expect(cfbSeason(new Date('2026-06-30T23:59:59Z'))).toBe(2025)
    expect(cfbSeason(new Date('2026-07-01T00:00:00Z'))).toBe(2026)
    expect(cfbSeason(new Date('2027-01-10T12:00:00Z'))).toBe(2026)
  })

  it('the NHL rolls over in September', () => {
    expect(nhlSeasons(new Date('2026-08-31T23:59:59Z'))[0]).toBe('20252026')
    expect(nhlSeasons(new Date('2026-09-01T00:00:00Z'))[0]).toBe('20262027')
  })
})
