// @vitest-environment happy-dom
/**
 * The phone's Scope bar on its own: a row of cards, the first for the
 * whole Scope; which is marked current; what a tap does; and keeping the
 * current card in view. happy-dom lays nothing out, so the cards' places
 * are given here.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fantasyLeagueFixture,
  predictionFixture,
  timelineFixture,
} from './fixtures'
import type { PagerSummary } from '@/components/timeline/ScopePager'
import { ScopePager, pagerSummary } from '@/components/timeline/ScopePager'
import { pageKey, scopePages } from '@/components/timeline/scopePages'

/** The strip shows this much; each card is this wide, in a row. */
const VIEW = 340
const CARD = 140
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
  opens: 'See all the games',
}

function renderPager(
  over: Partial<React.ComponentProps<typeof ScopePager>> = {},
) {
  const onPick = vi.fn()
  const onSummary = vi.fn()
  const props = {
    pages: gamePages,
    current: 'all',
    summary,
    onPick,
    onSummary,
    ...over,
  }
  const view = render(<ScopePager {...props} />)
  return {
    ...view,
    onPick: over.onPick ?? onPick,
    onSummary: over.onSummary ?? onSummary,
    strip: () => document.querySelector<HTMLElement>('[data-scope-pager] ul')!,
    rerenderAt: (current: string) =>
      view.rerender(<ScopePager {...props} current={current} />),
  }
}

const cards = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('[data-scope-pager] li > button'),
  )
const currentCard = () =>
  document.querySelector<HTMLElement>('[data-scope-pager] [aria-current]')

beforeEach(() => {
  // Cards in a row, CARD wide each; the strip shows VIEW of it.
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(
    function (this: HTMLElement) {
      const li = this.closest('li')
      return li ? Array.from(li.parentElement!.children).indexOf(li) * CARD : 0
    },
  )
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
    () => CARD,
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    () => VIEW,
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
})

describe('ScopePager', () => {
  it('shows every page as a card in one row, the whole Scope first', () => {
    renderPager()
    expect(cards()).toHaveLength(gamePages.length)
    expect(cards()[0].getAttribute('aria-label')).toMatch(
      /^All Leagues: 3 games · 2 live\. See all the games$/,
    )
    // Each Game's card names both teams and their scores.
    for (const [i, page] of gamePages.entries()) {
      if (page.kind !== 'game') continue
      expect(cards()[i].getAttribute('aria-label')).toContain(
        `${page.game.awayTeam.abbreviation} ${page.game.score.away}, ${page.game.homeTeam.abbreviation} ${page.game.score.home}`,
      )
      expect(cards()[i].textContent).toContain(page.game.homeTeam.abbreviation)
    }
  })

  it('marks the current card', () => {
    const { rerenderAt } = renderPager({ current: pageKey(gamePages[2]) })
    expect(currentCard()).toBe(cards()[2])
    // A deeper shade, not a colored outline crowding the small text.
    expect(currentCard()!.className).toContain('bg-accent/15')
    expect(currentCard()!.className).not.toContain('border-accent')
    expect(cards()[1].className).not.toContain('bg-accent/15')
    rerenderAt('all')
    expect(currentCard()).toBe(cards()[0])
  })

  it('tapping a card picks it (to narrow and open it)', () => {
    const { onPick, onSummary } = renderPager()
    fireEvent.click(cards()[2])
    expect(onPick).toHaveBeenCalledWith(gamePages[2])
    expect(onSummary).not.toHaveBeenCalled()
  })

  it('the first card opens the list, or once narrowed shows everything', () => {
    const { onSummary, onPick, rerenderAt } = renderPager()
    fireEvent.click(cards()[0])
    expect(onSummary).toHaveBeenCalledTimes(1)
    expect(onPick).not.toHaveBeenCalled()
    rerenderAt(pageKey(gamePages[1]))
    expect(cards()[0].getAttribute('aria-label')).toMatch(/\. Show everything$/)
    expect(cards()[0].textContent).toContain('Show everything')
    fireEvent.click(cards()[0])
    expect(onSummary).toHaveBeenCalledTimes(2)
  })

  it('with nothing to list and nothing narrowed, the first card does nothing', () => {
    renderPager({ summary: { ...summary, opens: null } })
    expect(cards()[0]).toHaveProperty('disabled', true)
  })

  it('scrolls a card chosen elsewhere into view, and only as far as needed', () => {
    const { strip, rerenderAt } = renderPager()
    expect(strip().scrollLeft).toBe(0)
    // The fourth card ends at 4 × CARD: scrolled just enough to show it.
    rerenderAt(pageKey(gamePages[3]))
    expect(strip().scrollLeft).toBe(4 * CARD + 12 - VIEW)
    // One already in view doesn't move the row.
    const at = strip().scrollLeft
    rerenderAt(pageKey(gamePages[2]))
    expect(strip().scrollLeft).toBe(at)
    // Back to the first: scrolled back to the start.
    rerenderAt('all')
    expect(strip().scrollLeft).toBe(0)
  })

  it('a scroll the Viewer didn’t make (Back restoring it) can’t hide the chosen card', () => {
    const { strip } = renderPager()
    strip().scrollLeft = 3 * CARD
    fireEvent.scroll(strip())
    expect(strip().scrollLeft).toBe(0)
  })

  it('a tap (a finger that doesn’t move) isn’t scrolling: a restore after it is still put right', () => {
    const { strip } = renderPager()
    // Even straight after a flick of the Viewer's own.
    fireEvent.touchStart(strip())
    fireEvent.touchMove(strip())
    fireEvent.touchEnd(strip())
    fireEvent.touchStart(cards()[0])
    fireEvent.touchEnd(cards()[0])
    strip().scrollLeft = 3 * CARD
    fireEvent.scroll(strip())
    expect(strip().scrollLeft).toBe(0)
  })

  it('leaves the Viewer’s own scrolling where they put it', () => {
    const { strip } = renderPager()
    fireEvent.touchStart(strip())
    fireEvent.touchMove(strip())
    strip().scrollLeft = 3 * CARD
    fireEvent.scroll(strip())
    fireEvent.touchEnd(strip())
    // Still coasting after the finger lifts.
    fireEvent.scroll(strip())
    expect(strip().scrollLeft).toBe(3 * CARD)
  })

  it('shows a Prediction’s Odds and money, and a Matchup’s sides and projections', () => {
    const pages = [
      ...scopePages({
        scope: 'predictions',
        gameId: null,
        selectedGame: null,
        games: [],
        predictions: [pred],
        leagues: [],
      }),
      ...scopePages({
        scope: 'fantasy',
        gameId: null,
        selectedGame: null,
        games: [],
        predictions: [],
        leagues: [league],
      }).slice(1),
    ]
    renderPager({ pages })
    const [, prediction, matchup] = cards()
    expect(prediction.textContent).toContain('Phillies to win')
    expect(prediction.textContent).toContain('62%')
    expect(prediction.textContent).toContain('+$1.70')
    expect(matchup.textContent).toContain('The League')
    expect(matchup.textContent).toMatch(/SAM.*110\.0.*88\.4/)
    expect(matchup.textContent).toMatch(/GG.*104\.0.*71\.2/)
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
    expect(s.opens).toBe('See all the games')
    expect(pagerSummary({ ...base, scope: 'following' }).kicker).toBe(
      'Following',
    )
    expect(pagerSummary({ ...base, scope: 'nfl' }).kicker).toMatch(/NFL/)
    const none = pagerSummary({ ...base, scope: 'all', games: [] })
    expect(none.title).toBe('No games yet')
    expect(none.opens).toBeNull()
  })

  it('sums the portfolio under Predictions, and opens it', () => {
    const s = pagerSummary({ ...base, scope: 'predictions' })
    expect(s.title).toBe('1 open · Staked $4.50')
    expect(s.opens).toBe('Open your portfolio')
    render(<>{s.figure}</>)
    expect(screen.getByText('$6.20')).toBeTruthy()
    expect(screen.getByText('+$1.70')).toBeTruthy()
    expect(
      pagerSummary({ ...base, scope: 'predictions', predictions: [] }).opens,
    ).toBeNull()
  })

  it('counts Matchups and those leading under Fantasy', () => {
    const s = pagerSummary({ ...base, scope: 'fantasy' })
    expect(s.title).toBe('1 this week · leading 1')
    expect(s.opens).toBe('See all your matchups')
    expect(pagerSummary({ ...base, scope: 'fantasy', leagues: [] }).opens).toBe(
      null,
    )
  })

  it('speaks of Games with one open, whatever the Scope', () => {
    expect(
      pagerSummary({ ...base, scope: 'predictions', gameId: fx.mlb.id }).kicker,
    ).toBe('Your Predictions’ games')
  })
})
