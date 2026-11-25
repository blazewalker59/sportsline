import { describe, expect, it } from 'vitest'
import {
  fantasyLeagueFixture,
  gameSummary,
  predictionFixture,
} from './fixtures'
import { heroHeadline } from '@/components/timeline/LiveBoard'

const day = '2026-11-24'
const live = gameSummary({ id: 'a', status: 'live' }, day)
const later = gameSummary({ id: 'b', status: 'scheduled' }, day)
const base = { predictions: [], leagues: [], allKicker: 'All Leagues' }

describe('heroHeadline', () => {
  it('leads All with what’s live, the slate beside it', () => {
    expect(
      heroHeadline({ ...base, tab: 'all', games: [live, later] }),
    ).toMatchObject({
      kicker: 'All Leagues',
      figure: '1 live',
      aside: '2 games',
    })
    expect(
      heroHeadline({ ...base, tab: 'all', games: [later], allKicker: 'NBA' }),
    ).toMatchObject({ kicker: 'NBA', figure: '1 game', aside: null })
  })

  it('names Following’s live Games', () => {
    expect(
      heroHeadline({ ...base, tab: 'following', games: [live] }),
    ).toMatchObject({
      kicker: 'Following',
      figure: '1 live',
      line: 'PHI 0–0 ATL',
    })
  })

  it('leads Predictions with the portfolio’s worth', () => {
    const h = heroHeadline({
      ...base,
      tab: 'predictions',
      games: [],
      predictions: [predictionFixture(live)],
    })
    expect(h).toMatchObject({
      kicker: 'Predictions',
      figure: '$6.20',
      line: '1 open · staked $4.50',
    })
    expect(h.aside).toMatch(/\+\$1\.70/)
  })

  it('leads Fantasy with one Matchup’s score, or how many lead', () => {
    const league = fantasyLeagueFixture()
    expect(
      heroHeadline({ ...base, tab: 'fantasy', games: [], leagues: [league] }),
    ).toMatchObject({
      figure: '88.4–71.2',
      aside: 'leading GG',
      line: 'The League',
    })
    expect(
      heroHeadline({
        ...base,
        tab: 'fantasy',
        games: [],
        leagues: [league, { ...league, id: 'two' }],
      }),
    ).toMatchObject({ figure: '2 of 2', aside: 'leading' })
  })
})
