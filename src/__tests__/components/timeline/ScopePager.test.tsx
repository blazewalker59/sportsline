// @vitest-environment happy-dom
/**
 * The phone's Scope bar on its own: which page is current, swiping (a
 * scroll that comes to rest), the arrows, and tapping. happy-dom lays
 * nothing out, so the strip is given a width here and scrolled by hand.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fantasyLeagueFixture,
  predictionFixture,
  timelineFixture,
} from './fixtures'
import type { ScopePage } from '@/components/timeline/scopePages'
import type { PagerSummary } from '@/components/timeline/ScopePager'
import { ScopePager, pagerSummary } from '@/components/timeline/ScopePager'
import { pageKey, scopePages } from '@/components/timeline/scopePages'

const WIDTH = 320
const fx = timelineFixture('2026-11-18')
const pred = predictionFixture(fx.mlb)
const league = fantasyLeagueFixture()
const gamePages = scopePages({
  scope: 'all',
  gameId: null,
  selectedGame: null,
  games: fx.games,
  predictions: [],
  leagues: [],
})
const summary: PagerSummary = {
  kicker: 'All Leagues',
  title: '3 games · 2 live',
  figure: null,
  opens: false,
}

function renderPager(
  over: Partial<React.ComponentProps<typeof ScopePager>> = {},
) {
  const onSelect = vi.fn()
  const onOpen = vi.fn()
  const props = {
    pages: gamePages,
    current: 'all',
    summary,
    onSelect,
    onOpen,
    ...over,
  }
  const view = render(<ScopePager {...props} />)
  return {
    ...view,
    onSelect: over.onSelect ?? onSelect,
    onOpen: over.onOpen ?? onOpen,
    strip: () =>
      document.querySelector<HTMLElement>('[data-scope-pager] > div')!,
    rerenderAt: (current: string) =>
      view.rerender(<ScopePager {...props} current={current} />),
  }
}

/** How a Game's page begins its label: "KC 14". */
const gameName = (i: number) => {
  const page = gamePages[i]
  if (page.kind !== 'game') throw new Error('not a Game')
  return new RegExp(
    `^${page.game.awayTeam.abbreviation} ${page.game.score.away},`,
  )
}

/** The page marked current. */
const currentPage = () =>
  document.querySelector<HTMLElement>('[data-scope-pager] [aria-current]')!

beforeEach(() => {
  // The strip is as wide as one page; nothing else needs a width.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.parentElement?.matches('[data-scope-pager]') ? WIDTH : 0
    },
  )
  HTMLElement.prototype.scrollTo = function (
    this: HTMLElement,
    opts?: ScrollToOptions | number,
  ) {
    if (typeof opts === 'object' && opts.left !== undefined)
      this.scrollLeft = opts.left
  } as typeof HTMLElement.prototype.scrollTo
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ScopePager', () => {
  it('scrolls the current page into view, and follows a selection made elsewhere', () => {
    const third = pageKey(gamePages[2])
    const { strip, rerenderAt } = renderPager({ current: third })
    expect(strip().scrollLeft).toBe(2 * WIDTH)
    expect(currentPage().getAttribute('aria-label')).toMatch(gameName(2))
    rerenderAt('all')
    expect(strip().scrollLeft).toBe(0)
    expect(currentPage().getAttribute('aria-label')).toMatch(/^All Leagues/)
  })

  /** A finger across the strip, ending `pages` along. */
  const swipeTo = (strip: HTMLElement, pages: number) => {
    fireEvent.touchStart(strip)
    strip.scrollLeft = pages * WIDTH
    fireEvent.scroll(strip)
    fireEvent.touchEnd(strip)
  }

  it('a swipe that comes to rest on another page selects it', () => {
    const { strip, onSelect } = renderPager()
    swipeTo(strip(), 1)
    fireEvent(strip(), new Event('scrollend'))
    expect(onSelect).toHaveBeenCalledWith(gamePages[1])
  })

  it('without scrollend, a scroll that stops moving selects', () => {
    vi.useFakeTimers()
    const { strip, onSelect } = renderPager()
    fireEvent.wheel(strip())
    strip().scrollLeft = 2 * WIDTH
    fireEvent.scroll(strip())
    expect(onSelect).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(200))
    expect(onSelect).toHaveBeenCalledWith(gamePages[2])
  })

  it('waits for the finger to lift', () => {
    vi.useFakeTimers()
    const { strip, onSelect } = renderPager()
    fireEvent.touchStart(strip())
    strip().scrollLeft = WIDTH
    fireEvent(strip(), new Event('scrollend'))
    act(() => vi.advanceTimersByTime(200))
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.touchEnd(strip())
    act(() => vi.advanceTimersByTime(200))
    expect(onSelect).toHaveBeenCalledWith(gamePages[1])
  })

  it('a scroll the Viewer didn’t make (Back restoring it) goes back to the current page', () => {
    const { strip, onSelect } = renderPager()
    strip().scrollLeft = WIDTH
    fireEvent(strip(), new Event('scrollend'))
    expect(onSelect).not.toHaveBeenCalled()
    expect(strip().scrollLeft).toBe(0)
  })

  it('keeps a page just picked while the address catches up', () => {
    const { strip, onSelect, rerenderAt } = renderPager()
    swipeTo(strip(), 2)
    fireEvent(strip(), new Event('scrollend'))
    expect(onSelect).toHaveBeenCalledWith(gamePages[2])
    // Another scroll ending before the selection lands doesn't undo it.
    fireEvent(strip(), new Event('scrollend'))
    expect(strip().scrollLeft).toBe(2 * WIDTH)
    rerenderAt(pageKey(gamePages[2]))
    expect(strip().scrollLeft).toBe(2 * WIDTH)
  })

  it('focus moving onto another page (the keyboard) selects it', () => {
    vi.useFakeTimers()
    const { strip, onSelect } = renderPager()
    fireEvent.focusIn(strip())
    strip().scrollLeft = WIDTH
    fireEvent.scroll(strip())
    act(() => vi.advanceTimersByTime(200))
    expect(onSelect).toHaveBeenCalledWith(gamePages[1])
  })

  it('coming to rest on the current page selects nothing', () => {
    const { strip, onSelect } = renderPager({ current: pageKey(gamePages[1]) })
    expect(strip().scrollLeft).toBe(WIDTH)
    fireEvent(strip(), new Event('scrollend'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('the arrows step to the neighbouring page, and stop at either end', () => {
    const { onSelect, rerenderAt } = renderPager()
    const previous = screen.getByRole('button', { name: /^Previous/ })
    const next = screen.getByRole('button', { name: /^Next/ })
    expect(previous).toHaveProperty('disabled', true)
    expect(next.getAttribute('aria-label')).toMatch(/^Next: /)
    fireEvent.click(next)
    expect(onSelect).toHaveBeenCalledWith(gamePages[1])
    rerenderAt(pageKey(gamePages[gamePages.length - 1]))
    expect(screen.getByRole('button', { name: /^Next/ })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('tapping the page in view opens it; one off to the side is selected first', () => {
    const { onSelect, onOpen } = renderPager({
      current: pageKey(gamePages[1]),
    })
    fireEvent.click(currentPage())
    expect(onOpen).toHaveBeenCalledWith(gamePages[1])
    const pager = document.querySelector<HTMLElement>('[data-scope-pager]')!
    const other = within(pager)
      .getAllByRole('button')
      .find((b) => gameName(2).test(b.getAttribute('aria-label') ?? ''))!
    fireEvent.click(other)
    expect(onSelect).toHaveBeenCalledWith(gamePages[2])
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('the first page opens only what it says it does', () => {
    renderPager()
    // Not a button when it opens nothing.
    expect(currentPage().tagName).toBe('DIV')
    cleanup()
    const { onOpen } = renderPager({ summary: { ...summary, opens: true } })
    fireEvent.click(currentPage())
    expect(onOpen).toHaveBeenCalledWith({ kind: 'all' })
  })

  it('counts pages past a handful, instead of dots', () => {
    const many: Array<ScopePage> = [
      { kind: 'all' },
      ...Array.from({ length: 12 }, (_, i) => ({
        kind: 'game' as const,
        id: `g${i}`,
        game: { ...fx.mlb, id: `g${i}` },
      })),
    ]
    renderPager({ pages: many, current: 'game:g3' })
    expect(screen.getByText('5 / 13')).toBeTruthy()
  })

  it('holds still as a View Transition layer and isn’t a Scope swipe', () => {
    renderPager()
    const pager = document.querySelector<HTMLElement>('[data-scope-pager]')!
    expect(pager.hasAttribute('data-no-swipe')).toBe(true)
    expect(pager.style.getPropertyValue('view-transition-name')).toBe(
      'scope-pager',
    )
  })
})

describe('pagerSummary', () => {
  const base = {
    gameId: null,
    games: fx.games,
    predictions: [pred],
    leagues: [league],
  }

  it('counts the Scope’s Games and the live ones', () => {
    const s = pagerSummary({ ...base, scope: 'all' })
    expect(s.kicker).toBe('All Leagues')
    expect(s.title).toMatch(/^3 games/)
    expect(s.opens).toBe(false)
    expect(pagerSummary({ ...base, scope: 'following' }).kicker).toBe(
      'Following',
    )
    expect(pagerSummary({ ...base, scope: 'nfl' }).kicker).toMatch(/NFL/)
    expect(pagerSummary({ ...base, scope: 'all', games: [] }).title).toBe(
      'No games yet',
    )
  })

  it('sums the portfolio under Predictions, and opens it', () => {
    const s = pagerSummary({ ...base, scope: 'predictions' })
    expect(s.title).toBe('1 open · Staked $4.50')
    expect(s.opens).toBe(true)
    render(<>{s.figure}</>)
    expect(screen.getByText('$6.20')).toBeTruthy()
    expect(screen.getByText('+$1.70')).toBeTruthy()
    expect(
      pagerSummary({ ...base, scope: 'predictions', predictions: [] }).opens,
    ).toBe(false)
  })

  it('counts Matchups and those leading under Fantasy', () => {
    expect(pagerSummary({ ...base, scope: 'fantasy' }).title).toBe(
      '1 this week · leading 1',
    )
  })

  it('speaks of Games with one open, whatever the Scope', () => {
    expect(
      pagerSummary({ ...base, scope: 'predictions', gameId: fx.mlb.id }).kicker,
    ).toBe('Your Predictions’ games')
  })
})
