import { describe, expect, it } from 'vitest'
import type { GameSummary } from '@/lib/model/timeline'
import { isPair } from '@/lib/brand/subject'
import {
  legTeam,
  predictionSubject,
  predictionTeams,
} from '@/lib/kalshi/legTeam'

const DET = {
  id: 'det',
  abbreviation: 'DET',
  logoUrl: null,
  colors: { primary: '#0076b6', secondary: '#b0b7bc' },
}
const CHI = {
  id: 'chi',
  abbreviation: 'CHI',
  logoUrl: null,
  colors: { primary: '#0b162a', secondary: '#c83803' },
}
const game = { id: 'g1', awayTeam: DET, homeTeam: CHI } as GameSummary
const other = {
  id: 'g2',
  awayTeam: { id: 'gb', abbreviation: 'GB', logoUrl: null },
  homeTeam: { id: 'min', abbreviation: 'MIN', logoUrl: null },
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

describe('predictionTeams', () => {
  it('is one team when every Leg is that team’s', () => {
    expect(predictionTeams([{ game, teamId: 'det' }])).toEqual({ team: DET })
    expect(
      predictionTeams([
        { game, teamId: 'det' },
        { game, teamId: 'det' },
      ]),
    ).toEqual({ team: DET })
  })

  it('is the Game’s two teams for a total or a same-game combo', () => {
    expect(predictionTeams([{ game, teamId: null }])).toEqual({
      away: DET,
      home: CHI,
    })
    expect(
      predictionTeams([
        { game, teamId: 'det' },
        { game, teamId: 'chi' },
      ]),
    ).toEqual({ away: DET, home: CHI })
  })

  it('is none across Games, or with nothing to go on', () => {
    expect(
      predictionTeams([
        { game, teamId: 'det' },
        { game: other, teamId: 'gb' },
      ]),
    ).toBeNull()
    expect(predictionTeams([{ game: null, teamId: null }])).toBeNull()
    expect(predictionTeams([])).toBeNull()
  })
})

describe('predictionSubject', () => {
  it('wears one team, or a Game’s pair', () => {
    const one = predictionSubject([{ game, teamId: 'det' }])
    expect(one && !isPair(one)).toBe(true)
    const two = predictionSubject([{ game, teamId: null }])
    expect(two && isPair(two)).toBe(true)
  })

  it('is none when a team has no colors', () => {
    expect(predictionSubject([{ game: other, teamId: null }])).toBeNull()
  })
})
