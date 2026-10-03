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

const DEFAULT_ROW = [
  'mlb',
  'nba',
  'nfl',
  'cfb',
  'top25',
  'sec',
  'big10',
  'big12',
  'acc',
  'nhl',
]

describe('normalizeLeagueSettings', () => {
  it('defaults to the Leagues with college groups after College Football', () => {
    expect(normalizeLeagueSettings(null)).toEqual({
      order: DEFAULT_ROW,
      hidden: [],
    })
  })

  it('places items new to a saved order beside their neighbours', () => {
    // Saved before the conference groups existed.
    expect(
      normalizeLeagueSettings({
        order: ['nhl', 'cfb', 'top25', 'nfl', 'xfl', 'nhl'],
        hidden: ['mlb', 'xfl'],
      }),
    ).toEqual({
      order: [
        'mlb',
        'nba',
        'nhl',
        'cfb',
        'top25',
        'sec',
        'big10',
        'big12',
        'acc',
        'nfl',
      ],
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
      order: ['sec', 'nfl', 'cfb', 'nba', 'mlb', 'nhl'],
      hidden: ['mlb', 'nhl', 'top25', 'big10', 'big12', 'acc'],
    })
    expect(visibleRowItems(settings)).toEqual(['sec', 'nfl', 'cfb', 'nba'])
    const leagues = visibleLeagues(settings)
    expect(leagues).toEqual(['nfl', 'cfb', 'nba'])
    expect(scopeFollows('all', [], leagues)).toEqual([
      { kind: 'league', league: 'nfl' },
      { kind: 'league', league: 'cfb' },
      { kind: 'league', league: 'nba' },
    ])
  })
})

describe('Conference Scopes', () => {
  it('parse, cover their Games, and round-trip through the URL form', () => {
    expect(parseScope('sec')).toBe('sec')
    expect(scopeFollows('sec', [])).toEqual([
      { kind: 'conference', conference: 'sec' },
    ])
    expect(followsToParam([{ kind: 'conference', conference: 'big10' }])).toBe(
      'conference:big10',
    )
    expect(followsFromParam('conference:big10,conference:pac12')).toEqual([
      { kind: 'conference', conference: 'big10' },
    ])
  })

  it('match college plays from a game with that Conference’s team', () => {
    const play = {
      league: 'cfb',
      kind: 'play',
      significance: 'scoring',
      awayTeam: {
        id: 'a',
        abbreviation: 'TEX',
        logoUrl: null,
        conference: 'sec',
      },
      homeTeam: {
        id: 'h',
        abbreviation: 'UTEP',
        logoUrl: null,
        conference: null,
      },
    } as unknown as TimelineItem
    const sec = {
      follows: [{ kind: 'conference' as const, conference: 'sec' as const }],
    }
    const acc = {
      follows: [{ kind: 'conference' as const, conference: 'acc' as const }],
    }
    expect(matchesFilter(play, sec)).toBe(true)
    expect(matchesFilter(play, acc)).toBe(false)
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
