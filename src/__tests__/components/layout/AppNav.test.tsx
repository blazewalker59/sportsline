// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
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
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ViewerState } from '@/lib/viewer/server'
import {
  AppShell,
  NAV_INSET_LEFT,
  TABS,
  activeTab,
} from '@/components/layout/AppNav'
import { VIEWER_KEY } from '@/lib/viewer/queries'
import { DEFAULT_LEAGUE_SETTINGS } from '@/lib/model/leagues'

const signedIn = {
  viewer: {
    id: 'v1',
    name: 'Sam Viewer',
    email: 'sam@example.com',
    image: null,
  },
  follows: [],
  readAt: null,
  leagues: DEFAULT_LEAGUE_SETTINGS,
} as unknown as ViewerState

const following = {
  ...signedIn,
  follows: [{ follow: { kind: 'team', teamId: 'tm_pit' } }],
} as unknown as ViewerState

const signedOut: ViewerState = { ...signedIn, viewer: null }

/** The app's screens as stubs, inside the shell, at `path`. */
async function renderAt(path: string, state: ViewerState) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData(VIEWER_KEY, state)
  const root = createRootRoute({
    component: () => (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
  })
  const page = (p: string) =>
    createRoute({
      getParentRoute: () => root,
      path: p,
      component: () => <p>screen {p}</p>,
    })
  const router = createRouter({
    routeTree: root.addChildren([
      page('/'),
      page('/predictions'),
      page('/fantasy'),
      page('/fantasy/$leagueId'),
      page('/follows'),
      page('/reactions'),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await act(async () => {
    await router.load()
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await screen.findByText(/^screen /)
  return { router }
}

const nav = () => screen.getByRole('navigation', { name: 'Main' })
const tabs = () => Array.from(nav().querySelectorAll<HTMLElement>('li a'))
const tab = (scope: string) =>
  nav().querySelector<HTMLElement>(`[data-scope-tab="${scope}"]`)!

/** The Scopes of the tabs marked as the current page. */
const current = () =>
  tabs()
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.dataset.scopeTab)

/** The current tab's lozenge. */
const lozengeEl = () => {
  const el = nav().querySelector<HTMLElement>('[data-nav-lozenge]')
  if (!el) throw new Error('no lozenge')
  return el
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('AppNav: the Timeline’s Scopes', () => {
  it('offers the four Scopes in order', async () => {
    await renderAt('/predictions', signedIn)
    expect(tabs().map((a) => a.textContent)).toEqual([
      'Following',
      'All',
      'Predictions',
      'Fantasy',
    ])
    expect(screen.getByRole('link', { name: 'All Leagues' })).toBe(tab('all'))
  })

  it.each([
    ['/?scope=following', 'following'],
    ['/?scope=all', 'all'],
    ['/?scope=predictions', 'predictions'],
    ['/?scope=fantasy', 'fantasy'],
  ])('marks the Scope on %s as current', async (path, scope) => {
    await renderAt(path, signedIn)
    expect(current()).toEqual([scope])
    const lozenge = lozengeEl()
    const index = TABS.findIndex((t) => t.scope === scope)
    expect(lozenge.getAttribute('data-active')).toBe(String(index))
    expect(lozenge.style.getPropertyValue('--i')).toBe(String(index))
  })

  it.each(['nfl', 'top25', 'sec', 'cfb'])(
    'marks All as current for the League-shaped Scope %s',
    async (scope) => {
      await renderAt(`/?scope=${scope}`, signedIn)
      expect(current()).toEqual(['all'])
    },
  )

  it('follows narrowing to one Prediction or Matchup, and a Game open', async () => {
    await renderAt('/?prediction=p1', signedIn)
    expect(current()).toEqual(['predictions'])
    cleanup()
    await renderAt('/?matchup=espn-1', signedIn)
    expect(current()).toEqual(['fantasy'])
    cleanup()
    await renderAt('/?game=nfl-1&scope=nfl', signedIn)
    expect(current()).toEqual(['all'])
  })

  it('with no Scope asked for, marks the remembered one, else the default', async () => {
    await renderAt('/', signedIn)
    expect(current()).toEqual(['all'])
    cleanup()
    await renderAt('/', following)
    expect(current()).toEqual(['following'])
    cleanup()
    localStorage.setItem('sportsline:scope', 'fantasy')
    await renderAt('/', following)
    await waitFor(() => expect(current()).toEqual(['fantasy']))
  })

  it.each(['following', 'predictions', 'fantasy'] as const)(
    'tapping %s shows the Timeline in that Scope',
    async (scope) => {
      const { router } = await renderAt('/?scope=nba', signedIn)
      fireEvent.click(tab(scope))
      await waitFor(() =>
        expect(router.state.location.search).toMatchObject({ scope }),
      )
      expect(current()).toEqual([scope])
    },
  )

  it('tapping a tab drops any Game, Play or narrowing, and keeps the day', async () => {
    const { router } = await renderAt(
      '/?scope=nba&day=2026-11-01&game=g1&play=p1',
      signedIn,
    )
    fireEvent.click(tab('fantasy'))
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        scope: 'fantasy',
      }),
    )
    const search = router.state.location.search as Record<string, unknown>
    expect(search.day).toBe('2026-11-01')
    expect(search.game).toBeUndefined()
    expect(search.play).toBeUndefined()
  })

  it('All returns to the League choice last made under it', async () => {
    const { router } = await renderAt('/?scope=top25', signedIn)
    fireEvent.click(tab('fantasy'))
    await waitFor(() => expect(current()).toEqual(['fantasy']))
    // Its address already points back there.
    expect(tab('all').getAttribute('href')).toContain('scope=top25')
    fireEvent.click(tab('all'))
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ scope: 'top25' }),
    )
    expect(current()).toEqual(['all'])
  })

  it('All goes to All Leagues when no League was chosen', async () => {
    const { router } = await renderAt('/?scope=following', following)
    fireEvent.click(tab('all'))
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ scope: 'all' }),
    )
  })

  it.each(['/predictions', '/fantasy', '/fantasy/espn-123', '/follows'])(
    'marks no tab on %s, and its tabs go back to the Timeline',
    async (path) => {
      const { router } = await renderAt(path, signedIn)
      expect(current()).toEqual([])
      expect(lozengeEl().getAttribute('data-active')).toBe('-1')
      expect(tab('predictions').getAttribute('href')).toBe(
        '/?scope=predictions',
      )
      fireEvent.click(tab('predictions'))
      await waitFor(() => expect(router.state.location.pathname).toBe('/'))
      expect(router.state.location.search).toEqual({ scope: 'predictions' })
      await screen.findByText('screen /')
      expect(current()).toEqual(['predictions'])
    },
  )

  it('hides the lozenge away from the Timeline', async () => {
    await renderAt('/reactions', signedIn)
    const lozenge = lozengeEl()
    expect(lozenge.getAttribute('data-active')).toBe('-1')
    // Parked on the first tab, so it never flies in from off the bar.
    expect(lozenge.style.getPropertyValue('--i')).toBe('0')
    expect(lozenge.getAttribute('aria-hidden')).toBe('true')
  })

  it('wears the glass, with each tab hooked for its press, focus and tone', async () => {
    await renderAt('/?scope=fantasy', signedIn)
    expect(nav().classList.contains('glass-nav')).toBe(true)
    expect(tabs().every((a) => a.classList.contains('glass-nav-tab'))).toBe(
      true,
    )
    expect(tab('fantasy').style.getPropertyValue('--nav-tone')).toBe(
      'var(--section-fantasy)',
    )
  })

  it('makes room for itself under the screens', async () => {
    await renderAt('/follows', signedIn)
    const shell = screen.getByText('screen /follows').parentElement
    expect(shell?.className).toContain('pb-24')
  })

  it('keeps the rail inset the Timeline lines up with', () => {
    expect(NAV_INSET_LEFT).toBe('md:left-20 lg:left-56')
  })

  it('stays out of Scope swipes and has its own View Transition layer', async () => {
    await renderAt('/', signedIn)
    expect(nav().hasAttribute('data-no-swipe')).toBe(true)
    expect(nav().style.viewTransitionName).toBe('app-nav')
  })

  it('is not shown to a signed-out visitor (the Landing)', async () => {
    await renderAt('/', signedOut)
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Following' })).toBeNull()
    // No room kept for a bar that isn't there.
    const shell = screen.getByText('screen /').parentElement
    expect(shell?.className ?? '').not.toContain('pb-24')
  })
})

describe('activeTab', () => {
  it.each([
    [null, -1],
    ['following', 0],
    ['all', 1],
    ['nhl', 1],
    ['top25', 1],
    ['big12', 1],
    ['predictions', 2],
    ['fantasy', 3],
  ] as const)('finds %s at %i', (scope, index) => {
    expect(activeTab(scope)).toBe(index)
  })
})

describe('the glass stylesheet', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8')
  /** The rules inside the block opened by `head` (to its matching brace). */
  const block = (head: string) => {
    const start = css.indexOf(head)
    expect(start).toBeGreaterThan(-1)
    let depth = 0
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      if (css[i] === '{') depth++
      if (css[i] === '}' && --depth === 0) return css.slice(start, i)
    }
    return ''
  }

  it('blurs with and without the -webkit- prefix', () => {
    const rule = block('.glass-nav {')
    expect(rule).toContain('-webkit-backdrop-filter: var(--glass-backdrop)')
    expect(rule).toContain('backdrop-filter: var(--glass-backdrop)')
  })

  it.each([
    '@media (prefers-reduced-transparency: reduce)',
    '@media (prefers-contrast: more)',
  ])('turns solid under %s', (query) => {
    const rules = block(query)
    expect(rules).toContain('.glass-nav {')
    expect(rules).toContain('backdrop-filter: none')
    expect(rules).toContain('background: var(--surface)')
  })

  it('falls back to a near-solid fill without backdrop-filter', () => {
    expect(block('@supports not (')).toContain('var(--glass-solid)')
  })

  it('holds the lozenge and the press still for reduced motion', () => {
    const rules = css
      .split('@media (prefers-reduced-motion: reduce)')
      .slice(1)
      .find((r) => r.includes('.glass-nav-lozenge'))
    expect(rules).toBeDefined()
    expect(rules).toContain('transition: none')
  })

  it('lets the lozenge slide through a Scope change’s View Transition', () => {
    expect(block('::view-transition-old(app-nav)')).toContain('display: none')
    expect(block('::view-transition-new(app-nav)')).toContain('animation: none')
  })

  it('styles the current tab by aria-current', () => {
    expect(css).toContain(".glass-nav-tab[aria-current='page'] .glass-nav-icon")
  })
})
