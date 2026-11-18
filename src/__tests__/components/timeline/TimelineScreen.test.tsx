// @vitest-environment happy-dom
/**
 * The two-pane Timeline: from `lg` a selected Game opens beside the
 * Scope's feed; on phones it takes the feed's place, as it always has.
 * The data hooks are stubbed with hand-written Games and Plays; the
 * screen, its feeds, the pinned top and the router are real.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { viewerState } from '../screenHarness'
import { timelineFixture } from './fixtures'
import type * as ViewerModule from '@/lib/viewer/useViewer'
import { TimelineScreen } from '@/components/timeline/TimelineScreen'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { VIEWER_KEY } from '@/lib/viewer/queries'
import { DEFAULT_LEAGUE_SETTINGS } from '@/lib/model/leagues'

const day = sportsDayOf(new Date())
const fx = timelineFixture(day)

vi.mock('@/lib/timeline/useLiveTimeline', () => ({
  useLiveTimeline: () => ({
    items: fx.items,
    previousItems: [],
    previousGames: [],
    games: fx.games,
    loading: false,
    error: false,
    connection: 'live',
    hasMore: false,
    loadingMore: false,
    loadMore: () => {},
    reload: () => Promise.resolve(),
  }),
}))

vi.mock('@/lib/games/useLiveGame', () => ({
  useLiveGame: (gameId: string | null) => ({
    data: gameId ? fx.detail(gameId) : undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: () => Promise.resolve(),
    connection: 'live',
  }),
}))

vi.mock('@/components/timeline/usePastDay', () => ({
  usePastDay: () => 'done',
}))

vi.mock('@/lib/reactions/useReactions', () => ({
  useReactions: () => ({ data: undefined }),
  useSetReaction: () => () => {},
}))

// The Scope's own queries (Kalshi, Fantasy) are server functions: the
// All Scope over every League, with nothing connected.
vi.mock('@/components/timeline/useTimelineScope', async () => {
  const { visibleLeagues, visibleRowItems } =
    await import('@/lib/model/leagues')
  return {
    useTimelineScope: () => ({
      scope: 'all',
      follows: visibleLeagues(DEFAULT_LEAGUE_SETTINGS).map((league) => ({
        kind: 'league',
        league,
      })),
      viewerFollows: [],
      rowItems: visibleRowItems(DEFAULT_LEAGUE_SETTINGS),
      leagues: visibleLeagues(DEFAULT_LEAGUE_SETTINGS),
      kalshi: { data: null, isPending: false },
      predictionList: { data: [] },
      openPredictions: [],
      predictionGames: [],
      selectedPrediction: null,
      selectPrediction: () => {},
      fantasyLeagues: [],
      selectedMatchup: null,
      selectMatchup: () => {},
    }),
  }
})

const readMarker = vi.hoisted(() => vi.fn())
vi.mock('@/lib/viewer/useViewer', async (importOriginal) => ({
  ...(await importOriginal<typeof ViewerModule>()),
  useReadMarkerWriter: readMarker,
}))

/** The window is this wide, as far as `(min-width: 64rem)` goes. */
function setWide(wide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('64rem') ? wide : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

function renderTimeline(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData(VIEWER_KEY, viewerState())
  const rootRoute = createRootRoute()
  const timeline = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (s: Record<string, unknown>) => ({
      game: typeof s.game === 'string' ? s.game : undefined,
      play: typeof s.play === 'string' ? s.play : undefined,
    }),
    component: function Route() {
      const { game, play } = timeline.useSearch()
      return <TimelineScreen gameId={game} playId={play} />
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([timeline]),
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router }
}

const scopeFeed = () => document.querySelector<HTMLElement>('[data-scope-feed]')
const gamePane = () => document.querySelector<HTMLElement>('[data-game-pane]')

/** Every view-transition-name set in the DOM. */
function transitionNames(): Array<string> {
  return Array.from(document.querySelectorAll<HTMLElement>('[style]'))
    .map((el) => el.style.getPropertyValue('view-transition-name'))
    .filter((name) => name && name !== 'none')
}

beforeEach(() => readMarker.mockClear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('TimelineScreen, wide (two panes)', () => {
  beforeEach(() => setWide(true))

  it('shows the Scope feed, unfiltered, beside the selected Game', async () => {
    renderTimeline('/?game=g_mlb')
    await waitFor(() => expect(gamePane()).toBeTruthy())
    const feed = scopeFeed()!
    expect(feed).toBeTruthy()
    // The feed keeps every Game's plays, including the selected one's.
    expect(feed.textContent).toContain('Jalen Brunson')
    expect(feed.textContent).toContain('Josh Allen')
    expect(feed.textContent).toContain('Bryce Harper homers')
    // The pane has only the Game's, with its scoreboard, box score and Close.
    const pane = gamePane()!
    expect(pane.dataset.gamePane).toBe('g_mlb')
    expect(pane.textContent).toContain('Bryce Harper homers')
    expect(pane.textContent).not.toContain('Jalen Brunson')
    expect(within(pane).getByText('Philadelphia Phillies')).toBeTruthy()
    expect(within(pane).getByText('Box score')).toBeTruthy()
    expect(within(pane).getByRole('link', { name: 'Close game' })).toBeTruthy()
    // The box score is inline: the card's sheet button hides from `lg`
    // (CSS, so a phone's server render keeps it).
    expect(
      screen.getByRole('button', { name: 'Box score' }).className,
    ).toContain('lg:hidden')
  })

  it('keeps the Read Marker moving with a Game open', async () => {
    renderTimeline('/?game=g_mlb')
    await waitFor(() => expect(gamePane()).toBeTruthy())
    expect(readMarker).toHaveBeenLastCalledWith(expect.anything(), true)
  })

  it('names each message once, though a Play is in both panes', async () => {
    renderTimeline('/?game=g_mlb')
    await waitFor(() => expect(gamePane()).toBeTruthy())
    const names = transitionNames()
    expect(names).toContain('m-p_mlb_3')
    expect(names).toContain('game-pane')
    expect(new Set(names).size).toBe(names.length)
  })

  it('swaps the pane when another Game is picked from the strip', async () => {
    const { router } = renderTimeline('/?game=g_mlb')
    await waitFor(() => expect(gamePane()).toBeTruthy())
    fireEvent.click(screen.getByRole('link', { name: /^BOS 108, NYK 112/ }))
    await waitFor(() => expect(gamePane()!.dataset.gamePane).toBe('g_nba'))
    expect(router.state.location.search).toMatchObject({ game: 'g_nba' })
    expect(gamePane()!.textContent).toContain('Jalen Brunson')
    expect(gamePane()!.textContent).not.toContain('Bryce Harper')
    expect(scopeFeed()).toBeTruthy()
  })

  it('swaps the pane when a Game is picked from the feed', async () => {
    renderTimeline('/?game=g_mlb')
    await waitFor(() => expect(gamePane()).toBeTruthy())
    fireEvent.click(
      within(scopeFeed()!).getAllByRole('link', {
        name: 'Show only the KC game',
      })[0],
    )
    await waitFor(() => expect(gamePane()!.dataset.gamePane).toBe('g_nfl'))
  })

  it('Close clears the game param and leaves the feed where it was', async () => {
    const { router } = renderTimeline('/?game=g_mlb')
    await waitFor(() => expect(gamePane()).toBeTruthy())
    fireEvent.click(screen.getByRole('link', { name: 'Close game' }))
    await waitFor(() => expect(gamePane()).toBeNull())
    expect(router.state.location.search).not.toHaveProperty('game')
    expect(scopeFeed()).toBeTruthy()
    expect(screen.getByText(/to follow it here/)).toBeTruthy()
  })

  it('Escape closes the pane, but not while a sheet is open', async () => {
    renderTimeline('/?game=g_mlb')
    await waitFor(() => expect(gamePane()).toBeTruthy())
    const sheet = document.createElement('div')
    sheet.setAttribute('role', 'dialog')
    document.body.appendChild(sheet)
    fireEvent.keyDown(window, { key: 'Escape' })
    await act(() => Promise.resolve())
    expect(gamePane()).toBeTruthy()
    sheet.remove()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(gamePane()).toBeNull())
  })
})

describe('TimelineScreen, narrow (one feed)', () => {
  beforeEach(() => setWide(false))

  it('a selected Game replaces the feed with its own thread', async () => {
    renderTimeline('/?game=g_mlb')
    await waitFor(() => expect(gamePane()).toBeTruthy())
    expect(scopeFeed()).toBeNull()
    const pane = gamePane()!
    expect(pane.textContent).toContain('Bryce Harper homers')
    expect(document.body.textContent).not.toContain('Jalen Brunson')
    // No pane chrome: the box score is the card's sheet, as before.
    expect(screen.queryByRole('link', { name: 'Close game' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Box score' })).toBeTruthy()
    // One feed, so its messages keep their names (for the filter's glide).
    const names = transitionNames()
    expect(names).toContain('m-p_mlb_3')
    expect(names).not.toContain('game-pane')
    expect(new Set(names).size).toBe(names.length)
    // A phone reading one Game doesn't move the Read Marker.
    expect(readMarker).toHaveBeenLastCalledWith(expect.anything(), false)
  })

  it('with no Game, the single feed and no pane', async () => {
    renderTimeline('/')
    await waitFor(() => expect(scopeFeed()).toBeTruthy())
    expect(gamePane()).toBeNull()
    expect(screen.queryByText(/to follow it here/)).toBeNull()
    expect(scopeFeed()!.textContent).toContain('Jalen Brunson')
  })

  it('Escape does nothing to a phone’s Game', async () => {
    renderTimeline('/?game=g_mlb')
    await waitFor(() => expect(gamePane()).toBeTruthy())
    fireEvent.keyDown(window, { key: 'Escape' })
    await act(() => Promise.resolve())
    expect(gamePane()).toBeTruthy()
  })
})
