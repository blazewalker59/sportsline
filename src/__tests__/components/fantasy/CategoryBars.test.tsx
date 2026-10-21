// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import basketball from '../../fixtures/fantasy/basketball-category-matchup.json'
import type { CategoryResult } from '@/lib/fantasy/categories'
import type { MatchupView, WireLeague } from '@/lib/fantasy/matchup'
import { CategoryBars } from '@/components/fantasy/CategoryBars'
import {
  categoryRecord,
  dayLabel,
  dayRecord,
  daySportsDay,
} from '@/components/fantasy/format'
import { readMatchup } from '@/lib/fantasy/matchup'

const view = (): MatchupView => {
  const league = basketball as unknown as WireLeague
  return readMatchup('basketball', league, 1)!
}

/** Each category row's markup, keyed by its label. */
const rows = (html: string) =>
  Object.fromEntries(
    [...html.matchAll(/<li[^>]*>.*?<\/li>/g)].map((r) => [
      /font-semibold text-muted">([^<]+)</.exec(r[0])?.[1],
      r[0],
    ]),
  )

afterEach(cleanup)

describe('CategoryBars', () => {
  it('edges a lead on the leader’s side, and leaves a tie unmarked', () => {
    const m = view()
    const tie = { ...m.categories![4], mine: '9', opponent: '9' }
    tie.leader = 'tie'
    const categories = m.categories!.map((c) =>
      c.statId === tie.statId ? tie : c,
    )
    const html = renderToStaticMarkup(
      <CategoryBars m={m} categories={categories} />,
    )
    expect(html).not.toMatch(/·\s*tied/)
    expect(html).not.toContain('yellow')
    const byLabel = rows(html)
    expect(byLabel[tie.label]).not.toContain('border-left-color')
    expect(byLabel[tie.label]).not.toContain('border-right-color')
    expect(byLabel[tie.label]).toContain('(tied)') // for screen readers only
    const mine = categories.find((c) => c.leader === 'mine')!
    expect(byLabel[mine.label]).toContain(
      'border-left-color:var(--color-accent)',
    )
    expect(byLabel[mine.label]).not.toContain('border-right-color')
    const theirs = categories.find((c) => c.leader === 'opponent')!
    expect(byLabel[theirs.label]).toContain(
      'border-right-color:var(--color-live)',
    )
    expect(byLabel[theirs.label]).not.toContain('border-left-color')
  })

  it('toggles between the matchup’s totals and the day’s', () => {
    const m = view()
    const { getByRole, container } = render(
      <CategoryBars
        m={m}
        categories={m.categories!}
        day={{ label: 'Today', categories: m.today! }}
      />,
    )
    const matchup = getByRole('radio', { name: /^Matchup/ })
    const today = getByRole('radio', { name: /^Today/ })
    expect(matchup.textContent).toBe(`Matchup ${categoryRecord(m)}`)
    expect(today.textContent).toBe(`Today ${dayRecord(m.today!)}`)
    expect(matchup.getAttribute('aria-checked')).toBe('true')
    const fgTotal = m.categories!.find((c) => c.label === 'FG%')!
    expect(rows(container.innerHTML)['FG%']).toContain(fgTotal.mine)

    fireEvent.click(today)
    expect(today.getAttribute('aria-checked')).toBe('true')
    const fg = rows(container.innerHTML)['FG%']
    expect(fg).toContain('.525')
    expect(fg).toContain('.360')
  })

  it('holds the day’s place while it loads', () => {
    const m = view()
    const { getByRole, container } = render(
      <CategoryBars
        m={m}
        categories={m.categories!}
        day={{ label: 'Sat, Oct 11', categories: null }}
      />,
    )
    const day = getByRole('radio', { name: /^Sat, Oct 11/ })
    expect(day.textContent).toContain('…')
    fireEvent.click(day)
    expect(container.innerHTML).not.toContain('border-left-color')
    expect(rows(container.innerHTML)['FG%']).toContain('…')
  })
})

describe('Matchup days', () => {
  const now = new Date('2026-10-13T18:00:00Z')
  it('names a day from the matchup’s current scoring period', () => {
    const m = { scoringPeriod: 85 }
    expect(dayLabel(m, 85, now)).toBe('Today')
    expect(dayLabel(m, 84, now)).toBe('Yesterday')
    expect(dayLabel(m, 82, now)).toBe('Sat, Oct 10')
    expect(dayLabel(m, 86, now)).toBe('Tomorrow')
    expect(dayLabel(m, 87, now)).toBe('Thu, Oct 15')
    expect(daySportsDay(m, 86, now)).toBe('2026-10-14')
  })

  it('records a day’s categories won, lost and tied', () => {
    const r = (leader: CategoryResult['leader']) =>
      ({ leader }) as CategoryResult
    expect(dayRecord([r('mine'), r('mine'), r('opponent')])).toBe('2–1')
    expect(dayRecord([r('mine'), r('tie'), r(null)])).toBe('1–0–1')
  })
})
