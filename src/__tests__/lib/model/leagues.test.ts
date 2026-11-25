import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '@/lib/model/timeline'
import {
  moveLeague,
  normalizeLeagueSettings,
  visibleLeagues,
  visibleRowItems,
} from '@/lib/model/leagues'
import { parseScope, scopeFollows } from '@/lib/model/scope'
import {
  followsFromParam,
  followsToParam,
  matchesFilter,
} from '@/lib/model/timeline'
import { conferenceOf } from '@/lib/sources/espn/common'

const DEFAULT_ROW = ['mlb', 'nba', 'nfl', 'cfb', 'cbb', 'nhl']

describe('normalizeLeagueSettings', () => {
  it('defaults to the Leagues, college ones among them', () => {
    expect(normalizeLeagueSettings(null)).toEqual({
      order: DEFAULT_ROW,
      hidden: [],
    })
  })

  it('drops what’s no longer on the row, and places new Leagues by their neighbours', () => {
    // Saved with the old college groups (Top 25, the Conferences).
    expect(
      normalizeLeagueSettings({
        order: ['nhl', 'cfb', 'top25', 'sec', 'nfl', 'xfl', 'nhl'],
        hidden: ['mlb', 'xfl', 'big10'],
      }),
    ).toEqual({
      order: ['mlb', 'nba', 'nhl', 'cfb', 'cbb', 'nfl'],
      hidden: ['mlb'],
    })
  })
})

describe('arranging the row', () => {
  it('moves one item, clamped to the ends', () => {
    const order = ['mlb', 'nba', 'nfl', 'cfb', 'nhl'] as const
    expect(moveLeague(order, 'nhl', 0)).toEqual([
      'nhl',
      'mlb',
      'nba',
      'nfl',
      'cfb',
    ])
    expect(moveLeague(order, 'mlb', 99)).toEqual([
      'nba',
      'nfl',
      'cfb',
      'nhl',
      'mlb',
    ])
  })

  it('shows items in order without hidden ones; All follows visible Leagues', () => {
    const settings = normalizeLeagueSettings({
      order: ['nfl', 'cfb', 'nba', 'mlb', 'nhl'],
      hidden: ['mlb', 'nhl'],
    })
    // College Basketball, new since this order was saved, lands by its
    // neighbour College Football.
    expect(visibleRowItems(settings)).toEqual(['nfl', 'cfb', 'cbb', 'nba'])
    const leagues = visibleLeagues(settings)
    expect(leagues).toEqual(['nfl', 'cfb', 'cbb', 'nba'])
    // College covers only what the Viewer opted into: here, nothing.
    expect(scopeFollows('all', [], leagues)).toEqual([
      { kind: 'league', league: 'nfl' },
      { kind: 'league', league: 'nba' },
    ])
  })
})

describe('college Conferences', () => {
  it('are no Scope (college is opt-in by Game), nor a Follow in the URL form', () => {
    expect(parseScope('sec')).toBeUndefined()
    expect(parseScope('top25')).toBeUndefined()
    expect(followsFromParam('conference:big10,league:nhl')).toEqual([
      { kind: 'league', league: 'nhl' },
    ])
  })

  it('reads ESPN conference ids from the scoreboard or the summary', () => {
    const c = { id: '1', homeAway: 'home' as const }
    expect(conferenceOf({ ...c, team: { id: '1', conferenceId: '8' } })).toBe(
      'sec',
    )
    expect(conferenceOf({ ...c, team: { id: '1', groups: { id: '5' } } })).toBe(
      'big10',
    )
    expect(
      conferenceOf({ ...c, team: { id: '1', conferenceId: '151' } }),
    ).toBeNull()
  })
})

describe('Fantasy coverage', () => {
  it('carries its Starters through the URL form and matches their plays', () => {
    const follows = scopeFollows(
      'fantasy',
      [],
      undefined,
      [],
      ['pl_a1', 'pl_b2'],
    )
    expect(follows).toEqual([
      { kind: 'fantasy', playerIds: ['pl_a1', 'pl_b2'] },
    ])
    const param = followsToParam(follows)
    expect(param).toBe('fantasy:pl_a1|pl_b2')
    expect(followsFromParam(param)).toEqual(follows)
    // No Starters yet still asks for the Viewer's own (read on the server).
    expect(followsFromParam('fantasy:')).toEqual([
      { kind: 'fantasy', playerIds: [] },
    ])
    const play = {
      kind: 'play',
      players: [{ id: 'pl_b2', name: 'B', role: 'rusher' }],
    } as unknown as TimelineItem
    expect(matchesFilter(play, { follows: [...follows] })).toBe(true)
    expect(
      matchesFilter({ ...play, players: [] } as TimelineItem, {
        follows: [...follows],
      }),
    ).toBe(false)
  })
})
