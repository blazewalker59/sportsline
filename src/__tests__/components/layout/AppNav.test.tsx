// @vitest-environment happy-dom
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
import { AppShell } from '@/components/layout/AppNav'
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

  it('makes room for itself under the screens', async () => {
    await renderAt('/follows', signedIn)
    const shell = screen.getByText('screen /follows').parentElement
    expect(shell?.className).toContain('pb-14')
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
    expect(shell?.className ?? '').not.toContain('pb-14')
  })
})
