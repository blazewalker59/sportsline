import { describe, expect, it } from 'vitest'
import type { Final } from '@/lib/sharp/form'
import { formOf, teamForms } from '@/lib/sharp/form'

const now = Date.parse('2026-10-06T14:00:00Z')
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()
const game = (
  d: number,
  home: string,
  homeScore: number,
  away: string,
  awayScore: number,
): Final => ({
  homeTeamId: home,
  awayTeamId: away,
  homeScore,
  awayScore,
  startsAt: daysAgo(d),
})

describe('team form', () => {
  it('reads the last week, or the last three Games when that’s fewer', () => {
    const forms = teamForms(
      [
        // PHI: three this week, all wins.
        game(1, 'phi', 110, 'x', 100),
        game(3, 'y', 95, 'phi', 105),
        game(5, 'phi', 120, 'z', 100),
        game(12, 'phi', 90, 'x', 110),
        // NE: one Game a week, so its last three.
        game(2, 'ne', 17, 'buf', 24),
        game(9, 'ne', 10, 'nyj', 20),
        game(16, 'mia', 21, 'ne', 14),
        game(30, 'ne', 40, 'mia', 0),
      ],
      now,
    )
    expect(forms.get('phi')).toMatchObject({ games: 3, wins: 3, losses: 0 })
    expect(forms.get('phi')!.avgMargin).toBeCloseTo((10 + 10 + 20) / 3)
    // The 30-days-ago blowout is past the lookback.
    expect(forms.get('ne')).toMatchObject({ games: 3, wins: 0, losses: 3 })
    expect(forms.get('ne')!.avgMargin).toBeCloseTo(-8)
  })

  const g = {
    league: 'nba' as const,
    home: { id: 'phi', abbreviation: 'PHI' },
    away: { id: 'nyk', abbreviation: 'NYK' },
  }
  const forms = teamForms(
    [
      game(1, 'phi', 120, 'a', 100),
      game(2, 'phi', 118, 'b', 104),
      game(1, 'nyk', 98, 'c', 110),
      game(3, 'nyk', 101, 'd', 109),
    ],
    now,
  )

  const ml = (teamId: string, side: 'yes' | 'no') => ({
    key: { gameId: 'g', kind: 'moneyline' as const, teamId, line: null },
    side,
  })

  it('leans toward the hotter Team, and away from it on NO', () => {
    const yes = formOf(ml('phi', 'yes'), g, forms)!
    expect(yes.lean).toBeGreaterThan(0.5)
    expect(yes.note).toContain('PHI 2-0, +17.0 a game')
    expect(formOf(ml('phi', 'no'), g, forms)!.lean).toBeCloseTo(-yes.lean)
    expect(formOf(ml('nyk', 'yes'), g, forms)!.lean).toBeCloseTo(-yes.lean)
  })

  it('reads totals against the line', () => {
    // Recent games average 215 points.
    const over = (line: number) =>
      formOf(
        {
          key: { gameId: 'g', kind: 'total', teamId: null, line },
          side: 'yes',
        },
        g,
        forms,
      )!.lean
    expect(over(205)).toBeGreaterThan(0)
    expect(over(225)).toBeLessThan(0)
  })

  it('says nothing on too few Games', () => {
    const one = teamForms([game(1, 'phi', 1, 'nyk', 0)], now)
    expect(formOf(ml('phi', 'yes'), g, one)).toBe(null)
  })
})
