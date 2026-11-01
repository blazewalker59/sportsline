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

describe('BoxScore', () => {
  it('shows one team’s one table, in one card', () => {
    const { getByRole, getAllByRole, container } = render(
      <BoxScore box={FULL} game={game} />,
    )
    const tabs = getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['KC', 'LV'])
    expect(getByRole('tab', { name: 'KC' }).getAttribute('aria-selected')).toBe(
      'true',
    )
    // A chip per table, named for what it counts.
    expect(
      [...container.querySelectorAll('[aria-pressed]')].map(
        (c) => c.textContent,
      ),
    ).toEqual(['Passing', 'Rushing'])
    expect(container.querySelectorAll('table')).toHaveLength(1)
    expect(container.textContent).toContain('Patrick Mahomes')
    expect(container.textContent).not.toContain('Geno Smith')
    expect(container.textContent).not.toContain('Isiah Pacheco')
  })

  it('switches tables by chip, and keeps the table across teams', () => {
    const { getByRole, container } = render(<BoxScore box={FULL} game={game} />)
    fireEvent.click(getByRole('button', { name: 'Rushing' }))
    expect(container.textContent).toContain('Isiah Pacheco')

    fireEvent.click(getByRole('tab', { name: 'LV' }))
    expect(container.textContent).toContain('Ashton Jeanty')
    expect(
      getByRole('button', { name: 'Rushing' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('wears the chosen team: the home team’s color on its tab', () => {
    const { getByRole } = render(<BoxScore box={FULL} game={game} />)
    const card = getByRole('region', { name: 'Box score' })
    expect(card.className).toContain('subject-cards')
    expect(card.className).not.toContain('subject-b')
    fireEvent.click(getByRole('tab', { name: 'LV' }))
    expect(card.className).toContain('subject-b')
  })

  it('has no chips for a lone table, and says when a team has none', () => {
    const { getByRole, container } = render(
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
    expect(container.querySelectorAll('[aria-pressed]')).toHaveLength(0)
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
