import { describe, expect, it } from 'vitest'
import type { Follow } from '@/lib/model/timeline'
import { defaultScope, parseScope, scopeFollows } from '@/lib/model/scope'
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
