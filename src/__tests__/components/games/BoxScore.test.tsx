// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameSummary } from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'
import { BoxScore } from '@/components/games/BoxScore'

const game = {
  awayTeam: { id: 'kc', abbreviation: 'KC', logoUrl: null },
  homeTeam: { id: 'lv', abbreviation: 'LV', logoUrl: null },
} as GameSummary

const row = (name: string, values: Array<string | number>) => ({
  player: { id: null, name },
  note: null,
  sub: false,
  values,
})

const box = (tables: GameBox['tables']): GameBox => ({
  linescore: {
    segments: [],
    away: [],
    home: [],
    totalColumns: [],
    awayTotals: [],
    homeTotals: [],
  },
  tables,
})

const FULL = box([
  {
    side: 'away',
    title: 'KC Passing',
    columns: ['C/ATT', 'YDS'],
    rows: [row('Patrick Mahomes', ['24/33', 291])],
  },
  {
    side: 'home',
    title: 'LV Passing',
    columns: ['C/ATT', 'YDS'],
    rows: [row('Geno Smith', ['21/30', 244])],
  },
  {
    side: 'away',
    title: 'KC Rushing',
    columns: ['CAR', 'YDS'],
    rows: [row('Isiah Pacheco', [18, 87])],
  },
  {
    side: 'home',
    title: 'LV Rushing',
    columns: ['CAR', 'YDS'],
    rows: [row('Ashton Jeanty', [20, 101])],
  },
])

afterEach(cleanup)

const TOTALS: GameBox['teamStats'] = [
  { label: 'Total yards', away: '378', home: '345' },
  { label: 'Turnovers', away: '2', home: '0', lower: true },
  { label: 'Possession', away: '31:20', home: '28:40', compare: 'clock' },
]

describe('BoxScore', () => {
  it('starts on the teams’ totals, each leaning to whoever is ahead', () => {
    const { getAllByRole, getByRole, container } = render(
      <BoxScore box={{ ...FULL, teamStats: TOTALS }} game={game} />,
    )
    expect(getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'KC',
      'Team stats',
      'LV',
    ])
    expect(
      getByRole('tab', { name: 'Team stats' }).getAttribute('aria-selected'),
    ).toBe('true')
    const rows = [...getByRole('list', { name: 'Team stats' }).children]
    expect(rows.map((r) => r.textContent)).toEqual([
      'KC 378Total yardsLV 345',
      'KC 2Turnovers (fewer is better)LV 0',
      'KC 31:20PossessionLV 28:40',
    ])
    const leans = [...container.querySelectorAll('[data-lean]')].map((m) =>
      Number(m.getAttribute('data-lean')),
    )
    // KC by yards and the clock; LV by turnovers, all the way.
    expect(leans[0]).toBeGreaterThan(0)
    expect(leans[1]).toBe(-1)
    expect(leans[2]).toBeGreaterThan(0)
    expect(container.textContent).not.toContain('Added up')
  })

  it('adds up the players’ lines for a box without the totals', () => {
    const { getByRole, container } = render(<BoxScore box={FULL} game={game} />)
    const rows = [...getByRole('list', { name: 'Team stats' }).children]
    expect(rows.map((r) => r.textContent)).toEqual([
      'KC 24/33Passing C/ATTLV 21/30',
      'KC 291Passing YDSLV 244',
      'KC 18Rushing CARLV 20',
      'KC 87Rushing YDSLV 101',
    ])
    expect(container.textContent).toContain('Added up from the players’ lines.')
  })

  it('shows a team’s every table, a section each, in one view', () => {
    const { getByRole, getAllByRole, container } = render(
      <BoxScore box={FULL} game={game} />,
    )
    fireEvent.click(getByRole('tab', { name: 'KC' }))
    expect(
      getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Passing', 'Rushing'])
    expect(container.querySelectorAll('table')).toHaveLength(2)
    expect(container.textContent).toContain('Patrick Mahomes')
    expect(container.textContent).toContain('Isiah Pacheco')
    expect(container.textContent).not.toContain('Geno Smith')
    // No chips: the team is the only filter.
    expect(container.querySelectorAll('[aria-pressed]')).toHaveLength(0)

    fireEvent.click(getByRole('tab', { name: 'LV' }))
    expect(container.textContent).toContain('Geno Smith')
    expect(container.textContent).toContain('Ashton Jeanty')
    expect(container.textContent).not.toContain('Patrick Mahomes')
  })

  it('wears the chosen team: the home team’s color on its tab', () => {
    const { getByRole } = render(<BoxScore box={FULL} game={game} />)
    const card = getByRole('region', { name: 'Box score' })
    expect(card.className).toContain('subject-cards')
    expect(card.className).not.toContain('subject-b')
    fireEvent.click(getByRole('tab', { name: 'LV' }))
    expect(card.className).toContain('subject-b')
  })

  it('has no Team stats with one team’s tables, and says when a team has none', () => {
    const { getByRole, queryByRole, container } = render(
      <BoxScore
        box={box([
          {
            side: 'away',
            title: 'KC Players',
            columns: ['PTS'],
            rows: [row('A', [10])],
          },
        ])}
        game={game}
      />,
    )
    expect(queryByRole('tab', { name: 'Team stats' })).toBeNull()
    expect(getByRole('tab', { name: 'KC' }).getAttribute('aria-selected')).toBe(
      'true',
    )
    fireEvent.click(getByRole('tab', { name: 'LV' }))
    expect(container.textContent).toContain('No stats for LV yet.')
  })

  it('starts on the team that has stats', () => {
    const { getByRole } = render(
      <BoxScore
        box={box([
          {
            side: 'home',
            title: 'LV Players',
            columns: ['PTS'],
            rows: [row('B', [12])],
          },
        ])}
        game={game}
      />,
    )
    expect(getByRole('tab', { name: 'LV' }).getAttribute('aria-selected')).toBe(
      'true',
    )
  })
})
