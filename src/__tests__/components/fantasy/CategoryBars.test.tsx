import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import basketball from '../../fixtures/fantasy/basketball-category-matchup.json'
import type { CategoryResult } from '@/lib/fantasy/categories'
import type { MatchupView, WireLeague } from '@/lib/fantasy/matchup'
import { CategoryBars } from '@/components/fantasy/CategoryBars'
import { dayLabel, dayRecord } from '@/components/fantasy/format'
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

describe('CategoryBars', () => {
  it('marks each category’s leader with a border, a tie in yellow, never “tied”', () => {
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
    const byLabel = rows(html)
    expect(byLabel[tie.label]).toContain('border-yellow-500')
    expect(byLabel[tie.label]).toContain('(tied)') // for screen readers only
    const mine = m.categories!.find((c) => c.leader === 'mine')!
    expect(byLabel[mine.label]).toContain('var(--color-accent)')
    expect(byLabel[mine.label]).not.toContain('border-yellow-500')
  })

  it('shows the matchup score and the day’s figures under each total', () => {
    const m = view()
    const html = renderToStaticMarkup(
      <CategoryBars
        m={m}
        categories={m.categories!}
        day={{ label: 'Today', categories: m.today! }}
      />,
    )
    expect(html).toContain(
      `Today <span class="font-semibold text-foreground">${dayRecord(m.today!)}`,
    )
    const fg = rows(html)['FG%']
    expect(fg).toContain('.525')
    expect(fg).toContain('.360')
  })

  it('holds the day’s place while it loads', () => {
    const m = view()
    const html = renderToStaticMarkup(
      <CategoryBars
        m={m}
        categories={m.categories!}
        day={{ label: 'Sat, Oct 11', categories: null }}
      />,
    )
    expect(html).toContain('Sat, Oct 11')
    expect(html).toContain('…')
  })
})

describe('Matchup days', () => {
  const now = new Date('2026-10-13T18:00:00Z')
  it('names a day from the matchup’s current scoring period', () => {
    const m = { scoringPeriod: 85 }
    expect(dayLabel(m, 85, now)).toBe('Today')
    expect(dayLabel(m, 84, now)).toBe('Yesterday')
    expect(dayLabel(m, 82, now)).toBe('Sat, Oct 10')
  })

  it('records a day’s categories won, lost and tied', () => {
    const r = (leader: CategoryResult['leader']) =>
      ({ leader }) as CategoryResult
    expect(dayRecord([r('mine'), r('mine'), r('opponent')])).toBe('2–1')
    expect(dayRecord([r('mine'), r('tie'), r(null)])).toBe('1–0–1')
  })
})
