import { describe, expect, it } from 'vitest'
import type { Follow } from '@/lib/model/timeline'
import {
  defaultScope,
  neighborScope,
  parseScope,
  scopeFollows,
  scopeStops,
} from '@/lib/model/scope'
import { DEFAULT_FOLLOWS } from '@/lib/model/timeline'

const mine: Array<Follow> = [{ kind: 'team', teamId: 'tm_pit' }]

describe('Scope', () => {
  it('starts on Following only for a Viewer who follows something', () => {
    expect(defaultScope(mine)).toBe('following')
    expect(defaultScope([])).toBe('all')
  })

  it('maps each Scope to the Follows its Timeline is fetched with', () => {
    expect(scopeFollows('all', mine)).toBe(DEFAULT_FOLLOWS)
    expect(scopeFollows('following', mine)).toEqual(mine)
    expect(scopeFollows('following', [])).toBe(DEFAULT_FOLLOWS)
    expect(scopeFollows('nhl', mine)).toEqual([
      { kind: 'league', league: 'nhl' },
    ])
  })

  it('parses only known Scopes', () => {
    expect(parseScope('mlb')).toBe('mlb')
    expect(parseScope('following')).toBe('following')
    expect(parseScope('xfl')).toBeUndefined()
  })
})

describe('Top 25 Scope', () => {
  it('parses and covers ranked college games', () => {
    expect(parseScope('top25')).toBe('top25')
    expect(scopeFollows('top25', [])).toEqual([{ kind: 'top25' }])
  })
})

describe('swiping between views', () => {
  const all = { following: true, predictions: true, fantasy: true }

  it('orders the views as the chips show them, skipping what isn’t offered', () => {
    expect(scopeStops('nfl', all)).toEqual([
      'nfl',
      'following',
      'predictions',
      'fantasy',
    ])
    expect(
      scopeStops('all', {
        following: false,
        predictions: true,
        fantasy: false,
      }),
    ).toEqual(['all', 'predictions'])
  })

  it('steps to the next or previous view, and stops at the ends', () => {
    const stops = scopeStops('nfl', all)
    expect(neighborScope(stops, 'following', 1)).toBe('predictions')
    expect(neighborScope(stops, 'predictions', -1)).toBe('following')
    expect(neighborScope(stops, 'fantasy', 1)).toBeNull()
    expect(neighborScope(stops, 'nfl', -1)).toBeNull()
  })

  it('treats any League choice as the League chip', () => {
    const stops = scopeStops('nfl', all)
    expect(neighborScope(stops, 'top25', 1)).toBe('following')
    expect(neighborScope(stops, 'following', -1)).toBe('nfl')
  })

  it('goes nowhere from a view that isn’t offered', () => {
    const stops = scopeStops('all', {
      following: false,
      predictions: true,
      fantasy: false,
    })
    expect(neighborScope(stops, 'fantasy', -1)).toBeNull()
  })
})
