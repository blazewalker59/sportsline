import { describe, expect, it } from 'vitest'
import { detailParam, gameSearch, parseDetail } from '@/lib/timeline/gameLink'
import { sportsDayOf } from '@/lib/model/sportsDay'

describe('gameSearch', () => {
  it('opens the Game today, or on its past day, and drops any open detail', () => {
    const today = sportsDayOf(new Date())
    expect(gameSearch('g1', today)).toEqual({ game: 'g1' })
    expect('detail' in gameSearch('g1', today)).toBe(true)
    expect(gameSearch('g1', '2020-01-01')).toEqual({
      game: 'g1',
      day: '2020-01-01',
    })
  })
})

describe('the detail param', () => {
  it.each([
    [
      { kind: 'prediction', id: 'KXNFL-26NOV-KC:yes' },
      'prediction:KXNFL-26NOV-KC:yes',
    ],
    [{ kind: 'matchup', leagueId: 'espn-123' }, 'matchup:espn-123'],
    [
      { kind: 'matchup', leagueId: 'sleeper-9', teamId: 4 },
      'matchup:sleeper-9@4',
    ],
  ] as const)('round-trips %o as %s', (detail, param) => {
    expect(detailParam(detail)).toBe(param)
    expect(parseDetail(param)).toEqual(detail)
  })

  it.each([undefined, '', 'prediction:', 'matchup:', 'game:g1', 'nonsense'])(
    'reads %o as nothing open',
    (value) => {
      expect(parseDetail(value)).toBeNull()
    },
  )
})
