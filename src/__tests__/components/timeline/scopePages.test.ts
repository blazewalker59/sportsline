import { describe, expect, it } from 'vitest'
import {
  fantasyLeagueFixture,
  predictionFixture,
  timelineFixture,
} from './fixtures'
import {
  currentPageKey,
  pageKey,
  pageSearch,
  scopePages,
} from '@/components/timeline/scopePages'

const fx = timelineFixture('2026-11-18')
const pred = predictionFixture(fx.mlb)
const league = fantasyLeagueFixture()
const base = {
  gameId: null,
  selectedGame: null,
  games: fx.games,
  predictions: [pred],
  leagues: [league],
}
const keys = (pages: ReturnType<typeof scopePages>) => pages.map(pageKey)

describe('scopePages', () => {
  it.each(['following', 'all', 'nfl', 'cfb'] as const)(
    'pages the Scope’s Games under %s, the whole Scope first',
    (scope) => {
      expect(keys(scopePages({ ...base, scope }))).toEqual([
        'all',
        ...fx.games.map((g) => `game:${g.id}`),
      ])
    },
  )

  it('pages open Predictions under Predictions', () => {
    expect(keys(scopePages({ ...base, scope: 'predictions' }))).toEqual([
      'all',
      'prediction:pred_1',
    ])
  })

  it('pages each league’s Matchup under Fantasy', () => {
    expect(keys(scopePages({ ...base, scope: 'fantasy' }))).toEqual([
      'all',
      'matchup:espn-1',
    ])
  })

  it('pages Games with one open, whatever the Scope', () => {
    const pages = scopePages({
      ...base,
      scope: 'predictions',
      gameId: fx.mlb.id,
      selectedGame: fx.mlb,
      games: [fx.mlb],
    })
    expect(keys(pages)).toEqual(['all', `game:${fx.mlb.id}`])
  })

  it('puts an open Game that isn’t the Scope’s (from a link) first', () => {
    const pages = scopePages({
      ...base,
      scope: 'following',
      gameId: fx.nfl.id,
      selectedGame: fx.nfl,
      games: [fx.mlb],
    })
    expect(keys(pages)).toEqual([
      'all',
      `game:${fx.nfl.id}`,
      `game:${fx.mlb.id}`,
    ])
  })

  it('is just the first page with nothing in the Scope', () => {
    expect(
      keys(scopePages({ ...base, scope: 'all', games: [], predictions: [] })),
    ).toEqual(['all'])
    expect(
      keys(scopePages({ ...base, scope: 'predictions', predictions: [] })),
    ).toEqual(['all'])
  })
})

describe('currentPageKey', () => {
  it('is the open Game, else the Prediction or Matchup, else the whole Scope', () => {
    const none = { gameId: null, predictionId: null, matchupId: null }
    expect(currentPageKey(none)).toBe('all')
    expect(currentPageKey({ ...none, matchupId: 'espn-1' })).toBe(
      'matchup:espn-1',
    )
    expect(currentPageKey({ ...none, predictionId: 'pred_1' })).toBe(
      'prediction:pred_1',
    )
    expect(
      currentPageKey({ ...none, predictionId: 'pred_1', gameId: 'g_mlb' }),
    ).toBe('game:g_mlb')
  })
})

describe('pageSearch', () => {
  const [all, , game] = scopePages({ ...base, scope: 'all' })
  const [, prediction] = scopePages({ ...base, scope: 'predictions' })
  const [, matchup] = scopePages({ ...base, scope: 'fantasy' })

  it('picks a Game within whatever else is chosen', () => {
    expect(game.kind).toBe('game')
    expect(pageSearch(game, null)).toEqual({ game: fx.games[1].id })
  })

  it('a Prediction or Matchup replaces the rest, in its own Scope', () => {
    expect(pageSearch(prediction, 'g_mlb')).toEqual({
      scope: 'predictions',
      game: undefined,
      prediction: 'pred_1',
      matchup: undefined,
    })
    expect(pageSearch(matchup, null)).toEqual({
      scope: 'fantasy',
      game: undefined,
      prediction: undefined,
      matchup: 'espn-1',
    })
  })

  it('the first page clears the Game when one is open, else everything', () => {
    expect(pageSearch(all, 'g_mlb')).toEqual({ game: undefined })
    expect(pageSearch(all, null)).toEqual({
      game: undefined,
      prediction: undefined,
      matchup: undefined,
    })
  })
})
