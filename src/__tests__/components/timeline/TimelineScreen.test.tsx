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
import {
  fantasyLeagueFixture,
  predictionFixture,
  timelineFixture,
} from './fixtures'
import type * as ViewerModule from '@/lib/viewer/useViewer'
import type * as ChartsModule from '@/components/charts/lazy'
import type * as FantasyQueries from '@/lib/fantasy/queries'
import { TimelineScreen } from '@/components/timeline/TimelineScreen'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { VIEWER_KEY } from '@/lib/viewer/queries'
import { DEFAULT_LEAGUE_SETTINGS } from '@/lib/model/leagues'
import { parseScope } from '@/lib/model/scope'

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

// Charts read their own server functions; they aren't what's under test.
vi.mock('@/components/charts/lazy', async (importOriginal) => ({
  ...(await importOriginal<typeof ChartsModule>()),
  OddsChart: () => null,
  MatchupRace: () => null,
}))

// A Matchup's server functions: another Matchup in the league reads as
// its two teams, and no Games this week.
vi.mock('@/lib/fantasy/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof FantasyQueries>()
  const { fantasyLeagueFixture: leagueFx } = await import('./fixtures')
  return {
    ...actual,
    leagueMatchupQuery: (leagueId: string, teamId: number) => ({
      queryKey: ['league-matchup', leagueId, teamId],
      queryFn: () => {
        const m = leagueFx().matchup!
        const o = m.others!.find((x) => x.left.teamId === teamId)!
        return Promise.resolve({
          ...m,
          mine: { ...o.left, projected: null, lineup: [] },
          opponent: { ...o.right!, projected: null, lineup: [] },
        })
      },
    }),
    matchupGamesQuery: (leagueId: string) => ({
      queryKey: ['matchup-games', leagueId],
      queryFn: () => Promise.resolve([]),
    }),
  }
})

// The Scope's own queries (Kalshi, Fantasy) are server functions: by
// default the All Scope over every League, with nothing connected; a test
// can set the Scope (and what it still needs) through `scopeOver`. With
// `fromAddress`, the selected Prediction and Matchup follow the address,
// as the real hook's do.
const scopeOver = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}))
vi.mock('@/components/timeline/useTimelineScope', async () => {
  const { visibleLeagues, visibleRowItems } =
    await import('@/lib/model/leagues')
  return {
    useTimelineScope: ({
      requestedScope,
      predictionId,
      matchupId,
    }: {
      requestedScope?: string
      predictionId: string | null
      matchupId: string | null
    }) => {
      const over = scopeOver.current as {
        fromAddress?: boolean
        openPredictions?: Array<{ id: string }>
        fantasyLeagues?: Array<{ id: string }>
      }
      const selected = over.fromAddress
        ? {
            selectedPrediction:
              over.openPredictions?.find((p) => p.id === predictionId) ?? null,
            selectedMatchup:
              over.fantasyLeagues?.find((l) => l.id === matchupId) ?? null,
          }
        : {}
      return {
        scope: requestedScope ?? 'all',
        setup: null,
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
        optIns: [],
        selectedPrediction: null,
        selectPrediction: () => {},
        fantasyLeagues: [],
        selectedMatchup: null,
        selectMatchup: () => {},
        ...scopeOver.current,
        ...selected,
      }
    },
  }
})

// A swipe across the Timeline, delivered straight to its handler.
const swipe = vi.hoisted(() => ({
  current: null as null | ((direction: 'left' | 'right') => void),
}))
vi.mock('@/components/layout/useSwipe', () => ({
  useSwipe: (_ref: unknown, onSwipe: (direction: 'left' | 'right') => void) => {
    swipe.current = onSwipe
  },
}))

const readMarker = vi.hoisted(() => vi.fn())
vi.mock('@/lib/viewer/useViewer', async (importOriginal) => ({
  ...(await importOriginal<typeof ViewerModule>()),
  useReadMarkerWriter: readMarker,
}))

/**
 * The window is this wide, as far as `(min-width: 64rem)` (two panes) and
 * `(min-width: 48rem)` (the rail, not the tab bar) go: wide is both, not
 * wide a phone's, neither; a tablet has the rail but one pane.
 */
function setWide(wide: boolean, { rail = wide }: { rail?: boolean } = {}) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('64rem')
          ? wide
          : query.includes('48rem')
            ? rail
            : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

function renderTimeline(url: string, viewer = viewerState()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData(VIEWER_KEY, viewer)
  const rootRoute = createRootRoute()
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const timeline = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (s: Record<string, unknown>) => ({
      game: str(s.game),
      play: str(s.play),
      scope: parseScope(s.scope),
      day: str(s.day),
      prediction: str(s.prediction),
      matchup: str(s.matchup),
      detail: str(s.detail),
    }),
    component: function Route() {
      const { game, play, scope, detail, prediction, matchup } =
        timeline.useSearch()
      return (
        <TimelineScreen
          gameId={game}
          playId={play}
          scope={scope}
          detail={detail}
          predictionId={prediction}
          matchupId={matchup}
        />
      )
    },
  })
  // The screens a prompt links to.
  const stub = (path: string) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <p>screen {path}</p>,
    })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      timeline,
      stub('/follows'),
      stub('/predictions'),
      stub('/fantasy'),
    ]),
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
/** The phone's home board: what the tab narrows to. */
const board = () =>
  document.querySelector<HTMLElement>(
    'section[aria-label="Games"], section[aria-label="Your Predictions"], section[aria-label="Your Matchups"]',
  )
/** One of the board's tiles (or chips), by its label. */
const tile = (name: RegExp) => within(board()!).getByRole('button', { name })
/** The board's chosen tile (aria-current), by its label. */
const chosenTile = (name: RegExp) => {
  const found = within(board()!)
    .getAllByRole('button', { name })
    .find((b) => b.getAttribute('aria-current') === 'true')
  if (!found) throw new Error(`No chosen tile named ${String(name)}`)
  return found
}
/** The strip over a narrowed feed. */
const narrowed = () => document.querySelector<HTMLElement>('[data-narrowed]')
const gamePane = () => document.querySelector<HTMLElement>('[data-game-pane]')

/** Every view-transition-name set in the DOM. */
function transitionNames(): Array<string> {
  return Array.from(document.querySelectorAll<HTMLElement>('[style]'))
    .map((el) => el.style.getPropertyValue('view-transition-name'))
    .filter((name) => name && name !== 'none')
}

beforeEach(() => {
  readMarker.mockClear()
  scopeOver.current = {}
  localStorage.clear()
})
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
    // The board over the feed marks it, and the strip has no Box score:
    // it's open, inline, in the pane.
    expect(chosenTile(/^PHI 2, ATL 3/)).toBeTruthy()
    expect(narrowed()!.textContent).toContain('PHI @ ATL')
    expect(
      within(narrowed()!).queryByRole('button', { name: /Box score/ }),
    ).toBeNull()
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

  it('swaps the pane when another Game is picked from the board', async () => {
    const { router } = renderTimeline('/?game=g_mlb')
    await waitFor(() => expect(gamePane()).toBeTruthy())
    fireEvent.click(tile(/BOS 108 · NYK 112/))
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

  it('a tile opens its Game in the pane at once; clicked again, it closes', async () => {
    const { router } = renderTimeline('/?scope=all')
    await waitFor(() => expect(board()).toBeTruthy())
    fireEvent.click(tile(/^KC 14, BUF 10/))
    await waitFor(() => expect(gamePane()!.dataset.gamePane).toBe('g_nfl'))
    // One click: narrowed and open, no sheet, the feed still beside it.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(scopeFeed()).toBeTruthy()
    fireEvent.click(chosenTile(/^KC 14, BUF 10/))
    await waitFor(() => expect(gamePane()).toBeNull())
    expect(search(router).game).toBeUndefined()
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
    // No pane chrome: the board stays over the thread, the Game chosen,
    // and the strip opens its box score.
    expect(screen.queryByRole('link', { name: 'Close game' })).toBeNull()
    expect(chosenTile(/^PHI 2, ATL 3/)).toBeTruthy()
    expect(narrowed()!.textContent).toContain('PHI @ ATL')
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

describe('TimelineScreen, Scopes (chosen from the main navigation)', () => {
  beforeEach(() => setWide(false))

  const leagueRow = () => screen.queryByRole('list', { name: 'Leagues' })
  const prompt = () =>
    document.querySelector<HTMLElement>('[data-scope-prompt]')

  it.each(['all', 'nfl', 'cfb'])(
    'offers the League row under the All tab (%s)',
    async (scope) => {
      renderTimeline(`/?scope=${scope}`)
      await waitFor(() => expect(scopeFeed()).toBeTruthy())
      const row = leagueRow()!
      expect(row).toBeTruthy()
      const chosen = within(row)
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-current') === 'true')
      expect(chosen).toHaveLength(1)
      // No Scope offered in two places: the nav's other tabs aren't here.
      expect(
        within(row).queryByRole('button', {
          name: /Following|Predictions|Fantasy/,
        }),
      ).toBeNull()
    },
  )

  it.each(['following', 'predictions', 'fantasy'])(
    'has no League row under the %s tab',
    async (scope) => {
      renderTimeline(`/?scope=${scope}`)
      await waitFor(() => expect(scopeFeed()).toBeTruthy())
      expect(leagueRow()).toBeNull()
    },
  )

  it('picks a League from the row', async () => {
    const { router } = renderTimeline('/?scope=all')
    await waitFor(() => expect(leagueRow()).toBeTruthy())
    fireEvent.click(
      within(leagueRow()!).getByRole('button', { name: 'College Football' }),
    )
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ scope: 'cfb' }),
    )
  })

  it.each([
    ['following', '/follows', 'Choose what to follow'],
    ['predictions', '/predictions', 'Connect on Predictions'],
    ['fantasy', '/fantasy', 'Connect on Fantasy'],
    ['fantasy-matchups', '/fantasy', 'Your Fantasy leagues'],
  ])(
    'with nothing behind it (%s), offers to set it up instead of a feed',
    async (setup, href, action) => {
      const scope = setup === 'fantasy-matchups' ? 'fantasy' : setup
      scopeOver.current = { setup }
      const { router } = renderTimeline(`/?scope=${scope}`)
      await waitFor(() => expect(prompt()).toBeTruthy())
      expect(prompt()!.dataset.scopePrompt).toBe(setup)
      // No feed under it: no plays, and no "No plays yet" either.
      expect(scopeFeed()!.textContent).not.toContain('Jalen Brunson')
      expect(scopeFeed()!.textContent).not.toContain('No plays yet')
      const link = within(prompt()!).getByRole('link', { name: action })
      expect(link.getAttribute('href')).toBe(href)
      fireEvent.click(link)
      await waitFor(() => expect(router.state.location.pathname).toBe(href))
    },
  )

  it('leaves a new Viewer’s Following to the first-run picker', async () => {
    scopeOver.current = { setup: 'following' }
    renderTimeline('/?scope=following', viewerState({ firstRunDone: false }))
    await waitFor(() => expect(screen.getByText(/Step 1 of 2/)).toBeTruthy())
    expect(prompt()).toBeNull()
  })

  it.each([
    ['following', 'left', 'nfl'],
    ['nfl', 'left', 'predictions'],
    ['predictions', 'left', 'fantasy'],
    ['fantasy', 'right', 'predictions'],
    ['predictions', 'right', 'nfl'],
    ['cfb', 'right', 'following'],
  ] as const)(
    'a swipe from %s (%s) steps to %s, in the nav’s order',
    async (from, direction, to) => {
      // The League last chosen under All, which the All tab returns to.
      localStorage.setItem('sportsline:leagueScope', 'nfl')
      const { router } = renderTimeline(`/?scope=${from}`)
      await waitFor(() => expect(scopeFeed()).toBeTruthy())
      act(() => swipe.current!(direction))
      await waitFor(() =>
        expect(router.state.location.search).toMatchObject({ scope: to }),
      )
    },
  )

  it('swipes land on the whole screen, not only on plays', async () => {
    // The swipe listens on the Timeline's root: with few plays it must
    // still reach the bottom of the screen (less the tab bar's room).
    renderTimeline('/?scope=all')
    await waitFor(() => expect(scopeFeed()).toBeTruthy())
    const root = scopeFeed()!.parentElement!
    expect(root.className).toContain('min-h-[calc(100dvh-6rem)]')
    expect(root.className).toContain('md:min-h-dvh')
  })

  it('a swipe stops at either end', async () => {
    const { router } = renderTimeline('/?scope=fantasy')
    await waitFor(() => expect(scopeFeed()).toBeTruthy())
    act(() => swipe.current!('left'))
    await act(() => Promise.resolve())
    expect(router.state.location.search).toMatchObject({ scope: 'fantasy' })
  })
})

const pred = predictionFixture(fx.mlb)
const league = fantasyLeagueFixture()
/** The Predictions Scope, with one open Prediction (its card selected). */
const predictionsScope = (over: Record<string, unknown> = {}) => ({
  scope: 'predictions',
  kalshi: { data: { changeDisplay: 'dollars' }, isPending: false },
  predictionList: { data: [pred] },
  openPredictions: [pred],
  predictionGames: [fx.mlb.id],
  selectedPrediction: pred,
  ...over,
})
/** The Fantasy Scope, with one league's Matchup (its card selected). */
const fantasyScope = (over: Record<string, unknown> = {}) => ({
  scope: 'fantasy',
  fantasyLeagues: [league],
  selectedMatchup: league,
  ...over,
})
const detailPane = () =>
  document.querySelector<HTMLElement>('[data-detail-pane]')
const search = (router: { state: { location: { search: unknown } } }) =>
  router.state.location.search as Record<string, unknown>

describe('TimelineScreen, wide: Predictions and Matchups in the pane', () => {
  beforeEach(() => setWide(true))

  it('a Prediction’s tile narrows the feed and opens it beside it', async () => {
    scopeOver.current = predictionsScope({
      selectedPrediction: null,
      fromAddress: true,
    })
    const { router } = renderTimeline('/?scope=predictions')
    await waitFor(() => expect(board()).toBeTruthy())
    fireEvent.click(tile(/^Phillies to win/))
    await waitFor(() =>
      expect(search(router)).toMatchObject({
        scope: 'predictions',
        prediction: 'pred_1',
        // In the address, like a Game, so reload and Back behave the same.
        detail: 'prediction:pred_1',
      }),
    )
    await waitFor(() => expect(detailPane()).toBeTruthy())
    const pane = detailPane()!
    expect(pane.dataset.detailPane).toBe('prediction')
    expect(within(pane).getByText('Phillies to win')).toBeTruthy()
    // Its sheet's content: the Odds, the money, the Leg and its Game.
    expect(within(pane).getByText('Cash out now')).toBeTruthy()
    expect(within(pane).getByText('Market')).toBeTruthy()
    expect(
      within(pane).getByRole('link', { name: 'Close prediction' }),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    // The feed stays where it was beside it.
    expect(scopeFeed()).toBeTruthy()
    expect(pane.style.getPropertyValue('view-transition-name')).toBe(
      'game-pane',
    )
    expect(chosenTile(/^Phillies to win/)).toBeTruthy()
  })

  it('opens a Matchup beside the feed, and another in the league', async () => {
    scopeOver.current = fantasyScope({
      selectedMatchup: null,
      fromAddress: true,
    })
    const { router } = renderTimeline('/?scope=fantasy')
    await waitFor(() => expect(board()).toBeTruthy())
    fireEvent.click(tile(/^The League/))
    await waitFor(() => expect(detailPane()).toBeTruthy())
    expect(search(router).detail).toBe('matchup:espn-1')
    const pane = detailPane()!
    expect(pane.dataset.detailPane).toBe('matchup')
    expect(within(pane).getByText('The League')).toBeTruthy()
    expect(within(pane).getByRole('link', { name: 'League ›' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    // The league's other Matchups are listed in it, the one showing
    // marked; another replaces it.
    const row = (name: RegExp) =>
      within(detailPane()!).getByRole('button', { name })
    const yours = /^Sam’s Squad 88\.4, Gridiron Gang 71\.2/
    const kings = /^Monday Kings 95\.1, Taco Corp 60\.5/
    expect(row(yours).getAttribute('aria-current')).toBe('true')
    fireEvent.click(row(kings))
    await waitFor(() => expect(search(router).detail).toBe('matchup:espn-1@3'))
    await waitFor(() =>
      expect(row(kings).getAttribute('aria-current')).toBe('true'),
    )
    expect(row(yours).getAttribute('aria-current')).toBeNull()
  })

  it('shows one thing at a time: Prediction, Game, Prediction, Matchup, Game', async () => {
    scopeOver.current = { ...predictionsScope(), fantasyLeagues: [league] }
    const { router } = renderTimeline(
      '/?scope=predictions&detail=prediction%3Apred_1',
    )
    await waitFor(() => expect(detailPane()).toBeTruthy())
    // A Leg's Game, from inside the Prediction: the pane swaps to it.
    fireEvent.click(
      within(detailPane()!).getAllByRole('link', { name: /PHI/ })[0],
    )
    await waitFor(() => expect(gamePane()).toBeTruthy())
    expect(gamePane()!.dataset.gamePane).toBe('g_mlb')
    expect(detailPane()).toBeNull()
    expect(search(router).detail).toBeUndefined()
    // A Prediction from the board opens in its place.
    fireEvent.click(tile(/^Phillies to win/))
    await waitFor(() => expect(detailPane()).toBeTruthy())
    expect(gamePane()).toBeNull()
    expect(search(router).game).toBeUndefined()
    // A Matchup replaces the Prediction.
    await act(() =>
      router.navigate({
        to: '/',
        search: { scope: 'fantasy', detail: 'matchup:espn-1' } as never,
      }),
    )
    await waitFor(() =>
      expect(detailPane()!.dataset.detailPane).toBe('matchup'),
    )
    expect(document.querySelectorAll('[data-detail-pane]')).toHaveLength(1)
    // And a Game from the board replaces the Matchup.
    scopeOver.current = { ...scopeOver.current, scope: 'all' }
    await act(() =>
      router.navigate({
        to: '/',
        search: { scope: 'all', detail: 'matchup:espn-1' } as never,
      }),
    )
    fireEvent.click(tile(/BOS 108 · NYK 112/))
    await waitFor(() => expect(gamePane()!.dataset.gamePane).toBe('g_nba'))
    expect(detailPane()).toBeNull()
    expect(search(router).detail).toBeUndefined()
  })

  it('Close clears it and leaves the feed', async () => {
    scopeOver.current = predictionsScope()
    const { router } = renderTimeline(
      '/?scope=predictions&detail=prediction%3Apred_1',
    )
    await waitFor(() => expect(detailPane()).toBeTruthy())
    fireEvent.click(screen.getByRole('link', { name: 'Close prediction' }))
    await waitFor(() => expect(detailPane()).toBeNull())
    expect(search(router).detail).toBeUndefined()
    expect(scopeFeed()).toBeTruthy()
    expect(screen.getByText(/Pick a Prediction, or a game/)).toBeTruthy()
  })

  it('Escape closes it, but not while a sheet is open', async () => {
    scopeOver.current = fantasyScope()
    renderTimeline('/?scope=fantasy&detail=matchup%3Aespn-1')
    await waitFor(() => expect(detailPane()).toBeTruthy())
    const sheet = document.createElement('div')
    sheet.setAttribute('role', 'dialog')
    document.body.appendChild(sheet)
    fireEvent.keyDown(window, { key: 'Escape' })
    await act(() => Promise.resolve())
    expect(detailPane()).toBeTruthy()
    sheet.remove()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(detailPane()).toBeNull())
  })

  it('says so when what it points to is gone', async () => {
    scopeOver.current = predictionsScope()
    renderTimeline('/?scope=predictions&detail=prediction%3Agone')
    await waitFor(() => expect(detailPane()).toBeTruthy())
    expect(detailPane()!.textContent).toContain('isn’t in your Kalshi account')
  })
})

describe('TimelineScreen, narrow: the home board', () => {
  beforeEach(() => setWide(false))

  const hero = () => document.querySelector<HTMLElement>('[data-tab-hero]')
  const strip = (name: string | RegExp) =>
    within(narrowed()!).getByRole('button', { name })

  it.each([
    ['following', 'Games'],
    ['all', 'Games'],
    ['predictions', 'Your Predictions'],
    ['fantasy', 'Your Matchups'],
  ])('offers what the %s tab narrows to', async (scope, region) => {
    scopeOver.current =
      scope === 'predictions'
        ? predictionsScope({ selectedPrediction: null })
        : scope === 'fantasy'
          ? fantasyScope({ selectedMatchup: null })
          : {}
    renderTimeline(`/?scope=${scope}`)
    await waitFor(() => expect(board()).toBeTruthy())
    expect(board()!.getAttribute('aria-label')).toBe(region)
    // No cards at the top, no bar over the tab bar: the board is the one place.
    expect(
      screen.queryByRole('list', { name: /Your Predictions|Your Matchups/ }),
    ).toBeNull()
    expect(document.querySelector('[data-scope-pager]')).toBeNull()
    expect(narrowed()).toBeNull()
    if (scope === 'predictions') {
      expect(tile(/^Phillies to win/)).toBeTruthy()
      expect(hero()!.textContent).toContain('$6.20')
      expect(hero()!.textContent).toContain('1 open')
    } else if (scope === 'fantasy') {
      expect(tile(/^The League/)).toBeTruthy()
      expect(hero()!.textContent).toContain('88.4–71.2')
      expect(hero()!.textContent).toContain('leading GG')
    } else {
      // The live Games as tiles; the finished one as a chip under them.
      expect(within(board()!).getByText(/Live now · 2/)).toBeTruthy()
      expect(tile(/^KC 14, BUF 10, Q3 8:12/)).toBeTruthy()
      expect(tile(/BOS 108 · NYK 112/)).toBeTruthy()
      // The live Games are the headline.
      expect(hero()!.textContent).toContain('2 live')
    }
  })

  it('a tablet (the rail, one pane) has the same board, opening sheets', async () => {
    setWide(false, { rail: true })
    scopeOver.current = predictionsScope({
      selectedPrediction: null,
      fromAddress: true,
    })
    const { router } = renderTimeline('/?scope=predictions')
    await waitFor(() => expect(board()).toBeTruthy())
    expect(hero()!.getAttribute('aria-label')).toBe('Predictions')
    fireEvent.click(tile(/^Phillies to win/))
    await waitFor(() => expect(search(router).prediction).toBe('pred_1'))
    // Narrowed, not opened; no pane on a tablet: the strip opens its sheet.
    expect(detailPane()).toBeNull()
    fireEvent.click(
      within(narrowed()!).getByRole('button', { name: /^Prediction/ }),
    )
    expect(
      await screen.findByRole('dialog', { name: 'Prediction' }),
    ).toBeTruthy()
  })

  it('collapses the board to one row, and remembers it on the device', async () => {
    renderTimeline('/?scope=all')
    await waitFor(() => expect(board()).toBeTruthy())
    const toggle = (name: string) =>
      within(board()!).getByRole('button', { name })
    expect(toggle('Grid').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle('One row'))
    await waitFor(() =>
      expect(toggle('One row').getAttribute('aria-pressed')).toBe('true'),
    )
    expect(localStorage.getItem('sportsline:board-layout')).toBe('row')
    // Every Game as a tile in the row, the finished one too.
    expect(tile(/^BOS 108, NYK 112, Final/)).toBeTruthy()
    fireEvent.click(toggle('Grid'))
    await waitFor(() =>
      expect(localStorage.getItem('sportsline:board-layout')).toBe('grid'),
    )
  })

  it('a tile narrows to its Game and stays on the board, chosen; tapped again it opens', async () => {
    const { router } = renderTimeline('/?scope=all')
    await waitFor(() => expect(board()).toBeTruthy())
    fireEvent.click(tile(/^KC 14, BUF 10/))
    await waitFor(() => expect(gamePane()?.dataset.gamePane).toBe('g_nfl'))
    expect(search(router).game).toBe('g_nfl')
    expect(scopeFeed()).toBeNull()
    // Narrowed, not opened; the board is still there, over the thread.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      within(gamePane()!).getByRole('region', { name: 'Games' }),
    ).toBeTruthy()
    expect(narrowed()!.textContent).toContain('KC @ BUF')
    fireEvent.click(chosenTile(/^KC 14, BUF 10/))
    expect(
      await screen.findByRole('dialog', { name: 'Box score' }),
    ).toBeTruthy()
  })

  it('another tile swaps the Game; the strip opens it, or shows everything again', async () => {
    const { router } = renderTimeline('/?scope=all')
    await waitFor(() => expect(board()).toBeTruthy())
    const start = router.history.length
    fireEvent.click(tile(/^KC 14, BUF 10/))
    await waitFor(() => expect(search(router).game).toBe('g_nfl'))
    fireEvent.click(tile(/^PHI 2, ATL 3/))
    await waitFor(() => expect(search(router).game).toBe('g_mlb'))
    expect(chosenTile(/^PHI 2, ATL 3/)).toBeTruthy()
    // Into a Game is one step; another replaces it.
    expect(router.history.length).toBe(start + 1)
    fireEvent.click(strip(/^Box score/))
    expect(
      await screen.findByRole('dialog', { name: 'Box score' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Show everything is Back, to the whole Scope.
    fireEvent.click(strip('Show everything'))
    await waitFor(() => expect(search(router).game).toBeUndefined())
    expect(router.history.canGoBack()).toBe(false)
    await waitFor(() => expect(scopeFeed()).toBeTruthy())
    expect(narrowed()).toBeNull()
  })

  it('a Prediction’s tile narrows the feed; the strip opens its sheet', async () => {
    scopeOver.current = predictionsScope({
      selectedPrediction: null,
      fromAddress: true,
    })
    const { router } = renderTimeline('/?scope=predictions')
    await waitFor(() => expect(board()).toBeTruthy())
    fireEvent.click(tile(/^Phillies to win/))
    await waitFor(() =>
      expect(search(router)).toMatchObject({
        scope: 'predictions',
        prediction: 'pred_1',
      }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(chosenTile(/^Phillies to win/)).toBeTruthy()
    fireEvent.click(strip(/^Prediction/))
    const sheet = await screen.findByRole('dialog', { name: 'Prediction' })
    expect(within(sheet).getByText('Phillies to win')).toBeTruthy()
    // A phone has no pane, nor puts the sheet in the address.
    expect(detailPane()).toBeNull()
    expect(search(router).detail).toBeUndefined()
  })

  it('opens the portfolio from the board; a Prediction picked there opens and narrows', async () => {
    scopeOver.current = predictionsScope({
      selectedPrediction: null,
      fromAddress: true,
    })
    const { router } = renderTimeline('/?scope=predictions')
    await waitFor(() => expect(board()).toBeTruthy())
    fireEvent.click(tile(/^Portfolio/))
    const sheet = await screen.findByRole('dialog', { name: 'Portfolio' })
    fireEvent.click(within(sheet).getByText('Phillies to win'))
    expect(
      await screen.findByRole('dialog', { name: 'Prediction' }),
    ).toBeTruthy()
    await waitFor(() => expect(search(router).prediction).toBe('pred_1'))
    expect(chosenTile(/^Phillies to win/)).toBeTruthy()
  })

  it('a Matchup’s tile narrows to it; tapped again it opens in full', async () => {
    scopeOver.current = fantasyScope({
      selectedMatchup: null,
      fromAddress: true,
    })
    const { router } = renderTimeline('/?scope=fantasy')
    await waitFor(() => expect(board()).toBeTruthy())
    fireEvent.click(tile(/^The League/))
    await waitFor(() =>
      expect(search(router)).toMatchObject({
        scope: 'fantasy',
        matchup: 'espn-1',
      }),
    )
    fireEvent.click(chosenTile(/^The League/))
    const matchup = await screen.findByRole('dialog', { name: 'The League' })
    expect(within(matchup).getByRole('banner').textContent).toContain(
      'Gridiron Gang',
    )
  })

  it.each([
    ['following', 'Following'],
    ['all', 'All Leagues'],
    ['nba', 'NBA'],
    ['predictions', 'Predictions'],
    ['fantasy', 'Fantasy'],
  ])('the %s tab opens on its hero, named for it', async (scope, kicker) => {
    scopeOver.current =
      scope === 'predictions'
        ? predictionsScope({ selectedPrediction: null })
        : scope === 'fantasy'
          ? fantasyScope({ selectedMatchup: null })
          : {}
    renderTimeline(`/?scope=${scope}`)
    await waitFor(() => expect(hero()).toBeTruthy())
    expect(hero()!.getAttribute('aria-label')).toBe(kicker)
    // Under All the League row is in the hero, and only there.
    const leagues = screen.queryAllByRole('list', { name: 'Leagues' })
    if (scope === 'all' || scope === 'nba') {
      expect(leagues).toHaveLength(1)
      expect(hero()!.contains(leagues[0])).toBe(true)
    } else expect(leagues).toHaveLength(0)
  })

  it('opens a Matchup as a sheet, which lists the league’s Matchups', async () => {
    scopeOver.current = fantasyScope()
    renderTimeline('/?scope=fantasy&matchup=espn-1')
    await waitFor(() => expect(narrowed()).toBeTruthy())
    fireEvent.click(strip(/^Matchup/))
    const sheet = () => screen.getByRole('dialog', { name: 'The League' })
    await waitFor(() => expect(sheet()).toBeTruthy())
    expect(detailPane()).toBeNull()
    // No League Matchups under cards on a phone: they're in the sheet, the
    // one showing marked.
    const row = (name: RegExp) => within(sheet()).getByRole('button', { name })
    const yours = /^Sam’s Squad 88\.4, Gridiron Gang 71\.2/
    const kings = /^Monday Kings 95\.1, Taco Corp 60\.5/
    expect(row(yours).getAttribute('aria-current')).toBe('true')
    fireEvent.click(row(kings))
    // Another Matchup opens in its place.
    await waitFor(() =>
      expect(row(kings).getAttribute('aria-current')).toBe('true'),
    )
    expect(row(yours).getAttribute('aria-current')).toBeNull()
    expect(within(sheet()).getByRole('banner').textContent).toContain(
      'Taco Corp',
    )
    // And back to the Viewer's own.
    fireEvent.click(row(yours))
    await waitFor(() =>
      expect(row(yours).getAttribute('aria-current')).toBe('true'),
    )
  })

  it('shows one left in the address as its sheet, and Done clears it', async () => {
    scopeOver.current = predictionsScope()
    const { router } = renderTimeline(
      '/?scope=predictions&detail=prediction%3Apred_1',
    )
    const sheet = await screen.findByRole('dialog', { name: 'Prediction' })
    expect(detailPane()).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(search(router).detail).toBeUndefined())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('neither is there while the Scope is still to be set up', async () => {
    scopeOver.current = { setup: 'predictions' }
    renderTimeline('/?scope=predictions')
    await waitFor(() =>
      expect(document.querySelector('[data-scope-prompt]')).toBeTruthy(),
    )
    expect(board()).toBeNull()
  })
})
