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
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ViewerState } from '@/lib/viewer/server'
import {
  AppShell,
  DESTINATIONS,
  NAV_INSET_LEFT,
  activeDestination,
} from '@/components/layout/AppNav'
import { VIEWER_KEY } from '@/lib/viewer/queries'

const signedIn = {
  viewer: {
    id: 'v1',
    name: 'Sam Viewer',
    email: 'sam@example.com',
    image: null,
  },
  follows: [],
  readAt: null,
  leagues: { order: [], hidden: [] },
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
}

/** The labels of the tabs marked as the current page. */
const current = () =>
  screen
    .queryAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent)

/** The active tab's lozenge. */
const lozengeEl = () => {
  const el = screen
    .getByRole('navigation', { name: 'Main' })
    .querySelector<HTMLElement>('[data-nav-lozenge]')
  if (!el) throw new Error('no lozenge')
  return el
}

describe('AppNav', () => {
  afterEach(cleanup)

  it('offers the four destinations in order', async () => {
    await renderAt('/predictions', signedIn)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const labels = Array.from(nav.querySelectorAll('li a')).map(
      (a) => a.textContent,
    )
    expect(labels).toEqual(['Timeline', 'Predictions', 'Fantasy', 'Follows'])
  })

  it.each([
    ['/', 'Timeline'],
    ['/?game=nfl-1&scope=nfl', 'Timeline'],
    ['/predictions', 'Predictions'],
    ['/fantasy', 'Fantasy'],
    ['/fantasy/espn-123', 'Fantasy'],
    ['/follows', 'Follows'],
  ])('marks %s as %s with aria-current', async (path, label) => {
    await renderAt(path, signedIn)
    expect(current()).toEqual([label])
  })

  it('marks no tab on a screen outside the four', async () => {
    await renderAt('/reactions', signedIn)
    expect(current()).toEqual([])
  })

  it.each([
    ['/', 0],
    ['/?game=nfl-1&scope=nfl', 0],
    ['/predictions', 1],
    ['/fantasy', 2],
    ['/fantasy/espn-123', 2],
    ['/follows', 3],
  ])(
    'slides the glass lozenge behind the current tab on %s',
    async (path, index) => {
      await renderAt(path, signedIn)
      const lozenge = lozengeEl()
      expect(lozenge.getAttribute('data-active')).toBe(String(index))
      expect(lozenge.style.getPropertyValue('--i')).toBe(String(index))
      // The tab it sits behind is the one marked current.
      expect(current()).toEqual([DESTINATIONS[index].label])
    },
  )

  it('hides the lozenge on a screen outside the four', async () => {
    await renderAt('/reactions', signedIn)
    const lozenge = lozengeEl()
    expect(lozenge.getAttribute('data-active')).toBe('-1')
    // Parked on the first tab, so it never flies in from off the bar.
    expect(lozenge.style.getPropertyValue('--i')).toBe('0')
    expect(lozenge.getAttribute('aria-hidden')).toBe('true')
  })

  it('wears the glass, with each tab hooked for its press, focus and tone', async () => {
    await renderAt('/fantasy', signedIn)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav.classList.contains('glass-nav')).toBe(true)
    const tabs = Array.from(nav.querySelectorAll('li a'))
    expect(tabs.every((a) => a.classList.contains('glass-nav-tab'))).toBe(true)
    const fantasy = screen.getByRole('link', { name: 'Fantasy' })
    expect((fantasy as HTMLElement).style.getPropertyValue('--nav-tone')).toBe(
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
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav.hasAttribute('data-no-swipe')).toBe(true)
    expect(nav.style.viewTransitionName).toBe('app-nav')
  })

  it('is not shown to a signed-out visitor (the Landing)', async () => {
    await renderAt('/', signedOut)
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Timeline' })).toBeNull()
    // No room kept for a bar that isn't there.
    const shell = screen.getByText('screen /').parentElement
    expect(shell?.className ?? '').not.toContain('pb-24')
  })
})

describe('activeDestination', () => {
  it.each([
    ['/', 0],
    ['/predictions', 1],
    ['/predictions/', 1],
    ['/fantasy', 2],
    ['/fantasy/espn-123', 2],
    ['/follows', 3],
    ['/reactions', -1],
    ['/games/nfl-1', -1],
    // A sibling path that merely starts with a destination's name.
    ['/fantasyland', -1],
  ])('finds %s at %i', (path, index) => {
    expect(activeDestination(path)).toBe(index)
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
})
