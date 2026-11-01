import { describe, expect, it } from 'vitest'
import type { GameSummary } from '@/lib/model/timeline'
import { legTeam } from '@/lib/kalshi/legTeam'

const game = {
  awayTeam: { id: 'det', abbreviation: 'DET', logoUrl: null },
  homeTeam: { id: 'chi', abbreviation: 'CHI', logoUrl: null },
} as GameSummary

describe('legTeam', () => {
  it('finds the Leg’s team on either side of its Game', () => {
    expect(legTeam({ game, teamId: 'det' })?.abbreviation).toBe('DET')
    expect(legTeam({ game, teamId: 'chi' })?.abbreviation).toBe('CHI')
  })

  it('is none without a Game or team, or when the team isn’t in it', () => {
    expect(legTeam({ game: null, teamId: 'det' })).toBeNull()
    expect(legTeam({ game, teamId: null })).toBeNull()
    expect(legTeam({ game, teamId: 'gb' })).toBeNull()
  })
})
