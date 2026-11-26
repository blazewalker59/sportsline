import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LeagueHistory, ScoreRecord } from '@/lib/fantasy/history'
import { HistoryView, whenText } from '@/components/fantasy/HistoryView'

const mark = (over: Partial<ScoreRecord>): ScoreRecord => ({
  season: 2024,
  period: 7,
  bracket: 'regular',
  team: 'Aces',
  manager: 'Ann',
  score: 150.2,
  opponent: 'Bees',
  opponentManager: 'Bob',
  opponentScore: 90,
  ...over,
})

const history: LeagueHistory = {
  seasons: [2025, 2024],
  champions: [
    {
      season: 2025,
      complete: false,
      champion: null,
      runnerUp: null,
      mine: false,
    },
    {
      season: 2024,
      complete: true,
      champion: { team: 'Aces', manager: 'Ann' },
      runnerUp: { team: 'Bees', manager: 'Bob' },
      mine: true,
    },
  ],
  managers: [
    {
      id: 'A',
      name: 'Ann',
      seasons: 2,
      wins: 20,
      losses: 8,
      ties: 0,
      playoffWins: 3,
      playoffLosses: 1,
      playoffs: 2,
      titles: 1,
      finals: 1,
      mine: true,
    },
  ],
  rivals: [
    {
      id: 'B',
      name: 'Bob',
      wins: 4,
      losses: 2,
      ties: 0,
      playoffWins: 1,
      playoffLosses: 0,
      last: {
        season: 2024,
        period: 16,
        bracket: 'playoff',
        points: true,
        mine: 120.5,
        theirs: 99,
      },
    },
  ],
  records: {
    highest: mark({}),
    lowest: mark({ manager: 'Bob', score: 41.3, opponentScore: 120 }),
    blowout: mark({}),
    closest: mark({ score: 100.1, opponentScore: 100.04 }),
  },
  missing: [],
}

describe('HistoryView', () => {
  it('shows champions, all-time records, the Viewer’s head-to-head and the league’s records', () => {
    const html = renderToStaticMarkup(
      <HistoryView sport="football" history={history} />,
    )
    expect(html).toContain('Champions')
    expect(html).toContain('In progress')
    expect(html).toContain('Aces · beat Bob')
    expect(html).toContain('20-8')
    expect(html).toContain('+1 final')
    expect(html).toContain('Your head-to-head')
    expect(html).toContain('Last: W 120.5–99.0 · 2024 · Week 16 · Playoffs')
    expect(html).toContain('1-0 playoffs')
    expect(html).toContain('Highest score')
    expect(html).toContain('by 60.2')
    expect(html).toContain('by 0.06')
    expect(html).toContain('2 seasons since 2024.')
  })

  it('leaves out head-to-head and records it doesn’t have, and names seasons it couldn’t read', () => {
    const html = renderToStaticMarkup(
      <HistoryView
        sport="basketball"
        history={{ ...history, rivals: [], records: null, missing: [2019] }}
      />,
    )
    expect(html).not.toContain('Your head-to-head')
    expect(html).not.toContain('Records</h2>')
    expect(html).toContain('Couldn’t read 2019')
  })

  it('says when there’s nothing to look back on', () => {
    const html = renderToStaticMarkup(
      <HistoryView
        sport="football"
        history={{ ...history, seasons: [], champions: [], managers: [] }}
      />,
    )
    expect(html).toContain('No seasons to look back on yet.')
  })
})

describe('whenText', () => {
  it('says week in football and matchup elsewhere', () => {
    expect(whenText('football', 2024, 7, 'regular')).toBe('2024 · Week 7')
    expect(whenText('baseball', 2025, 21, 'playoff')).toBe(
      '2025 · Matchup 21 · Playoffs',
    )
  })
})
