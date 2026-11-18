import { describe, expect, it } from 'vitest'
import type { Follow } from '@/lib/model/timeline'
import {
  SCOPE_TABS,
  defaultScope,
  neighborScope,
  parseScope,
  resolveScope,
  scopeFollows,
  scopeStops,
  scopeTab,
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

describe('the nav’s Scope tabs', () => {
  it('are Following, All, Predictions and Fantasy, in that order', () => {
    expect(SCOPE_TABS).toEqual(['following', 'all', 'predictions', 'fantasy'])
  })

  it.each([
    ['following', 'following'],
    ['predictions', 'predictions'],
    ['fantasy', 'fantasy'],
    ['all', 'all'],
    ['nfl', 'all'],
    ['top25', 'all'],
    ['sec', 'all'],
  ] as const)('puts %s under the %s tab', (scope, tab) => {
    expect(scopeTab(scope)).toBe(tab)
  })
})

describe('resolveScope', () => {
  it('takes the asked-for Scope, then the remembered one, then the default', () => {
    expect(
      resolveScope({ requested: 'nba', stored: 'fantasy', viewerFollows: [] }),
    ).toBe('nba')
    expect(resolveScope({ stored: 'fantasy', viewerFollows: [] })).toBe(
      'fantasy',
    )
    expect(resolveScope({ viewerFollows: mine })).toBe('following')
    expect(resolveScope({ viewerFollows: [] })).toBe('all')
  })

  it('keeps a Scope with nothing behind it (its tab offers to set it up)', () => {
    expect(resolveScope({ requested: 'following', viewerFollows: [] })).toBe(
      'following',
    )
    expect(resolveScope({ stored: 'predictions', viewerFollows: [] })).toBe(
      'predictions',
    )
  })

  it('reads one Prediction or Matchup narrowed to as its Scope', () => {
    expect(
      resolveScope({ requested: 'all', predictionId: 'p1', viewerFollows: [] }),
    ).toBe('predictions')
    expect(resolveScope({ matchupId: 'espn-1', viewerFollows: [] })).toBe(
      'fantasy',
    )
  })
})

describe('swiping between Scopes', () => {
  it('steps through all four tabs in the nav’s order, the League choice for All', () => {
    expect(scopeStops('nfl')).toEqual([
      'following',
      'nfl',
      'predictions',
      'fantasy',
    ])
    expect(scopeStops('all')).toEqual([
      'following',
      'all',
      'predictions',
      'fantasy',
    ])
  })

  it('steps to the next or previous tab, and stops at the ends', () => {
    const stops = scopeStops('nfl')
    expect(neighborScope(stops, 'following', 1)).toBe('nfl')
    expect(neighborScope(stops, 'nfl', 1)).toBe('predictions')
    expect(neighborScope(stops, 'predictions', -1)).toBe('nfl')
    expect(neighborScope(stops, 'fantasy', 1)).toBeNull()
    expect(neighborScope(stops, 'following', -1)).toBeNull()
  })

  it('treats any League choice as the All tab', () => {
    const stops = scopeStops('nfl')
    expect(neighborScope(stops, 'top25', 1)).toBe('predictions')
    expect(neighborScope(stops, 'sec', -1)).toBe('following')
  })
})
