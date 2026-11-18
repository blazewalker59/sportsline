// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NotFoundPanel,
  RouteErrorPanel,
  RoutePending,
} from '@/components/layout/RouteStates'
import { sendClientError } from '@/lib/ops/useClientErrors'
import { isStaleBuild, reloadForNewBuild } from '@/lib/ops/staleBuild'
import { UserError } from '@/lib/userError'

// These reach server functions (the error reporter, the Viewer's session
// behind the header's account button) over Start's RPC, which a test can't
// serve; the panels' own behaviour is what's under test.
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))
vi.mock('@/lib/ops/staleBuild', () => ({
  isStaleBuild: vi.fn(() => false),
  reloadForNewBuild: vi.fn(() => true),
}))
vi.mock('@/components/layout/AppHeader', () => ({
  AppHeader: () => <header>Sportsline</header>,
}))

/** A one-route app at `path` whose page loads with `loader`. */
function renderRoute(
  loader: () => Promise<unknown>,
  {
    path = '/thing',
    pending,
  }: { path?: string; pending?: () => React.JSX.Element } = {},
) {
  const rootRoute = createRootRoute()
  const index = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <p>Timeline</p>,
  })
  const thing = createRoute({
    getParentRoute: () => rootRoute,
    path: '/thing',
    loader,
    component: () => <p>Loaded</p>,
    errorComponent: RouteErrorPanel,
    notFoundComponent: () => <NotFoundPanel what="game" />,
    pendingComponent: pending,
    pendingMs: 0,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([index, thing]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  vi.mocked(sendClientError).mockClear()
  vi.mocked(isStaleBuild).mockReturnValue(false)
  vi.mocked(reloadForNewBuild).mockClear()
})
afterEach(cleanup)

describe('RouteErrorPanel', () => {
  it('says the screen failed, keeps the header, and reports the error', async () => {
    const boom = new Error('D1 timed out')
    renderRoute(() => Promise.reject(boom))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Couldn’t load this')).toBeTruthy()
    expect(screen.getByText('Sportsline')).toBeTruthy()
    // The raw message isn't the Viewer's to read.
    expect(screen.queryByText(/D1 timed out/)).toBeNull()
    expect(sendClientError).toHaveBeenCalledWith(boom, 'route')
  })

  it('shows a UserError in its own words', async () => {
    renderRoute(() => Promise.reject(new UserError('Kalshi is down')))
    expect(await screen.findByText('Kalshi is down')).toBeTruthy()
  })

  it('Try again re-runs the failed load and shows the screen', async () => {
    const loader = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValue(undefined)
    renderRoute(loader)
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Loaded')).toBeTruthy()
    expect(loader).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('stays on the panel when the retry fails too', async () => {
    const loader = vi.fn(() => Promise.reject(new Error('still down')))
    renderRoute(loader)
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    expect(
      await screen.findByRole('button', { name: 'Try again' }),
    ).toBeTruthy()
    expect(screen.queryByText('Loaded')).toBeNull()
  })

  it('Try again also recovers a screen that threw while rendering', async () => {
    let throws = true
    const rootRoute = createRootRoute({
      component: function Screen() {
        if (throws) throw new Error('bad data')
        return <p>Rendered</p>
      },
      errorComponent: RouteErrorPanel,
    })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    throws = false
    fireEvent.click(retry)
    expect(await screen.findByText('Rendered')).toBeTruthy()
  })

  it('links back to the Timeline', async () => {
    renderRoute(() => Promise.reject(new Error('x')))
    fireEvent.click(
      await screen.findByRole('link', { name: 'Back to the Timeline' }),
    )
    expect(await screen.findByText('Timeline')).toBeTruthy()
  })

  it('reloads into the new build instead of reporting a stale chunk', async () => {
    vi.mocked(isStaleBuild).mockReturnValue(true)
    renderRoute(() =>
      Promise.reject(new Error('Importing a module script failed.')),
    )
    await screen.findByRole('alert')
    expect(reloadForNewBuild).toHaveBeenCalled()
    expect(sendClientError).not.toHaveBeenCalled()
  })

  it('reports a stale chunk it has just reloaded for, rather than looping', async () => {
    vi.mocked(isStaleBuild).mockReturnValue(true)
    vi.mocked(reloadForNewBuild).mockReturnValue(false)
    renderRoute(() => Promise.reject(new Error('Importing failed')))
    await screen.findByRole('alert')
    expect(sendClientError).toHaveBeenCalledTimes(1)
  })
})

describe('NotFoundPanel', () => {
  it('shows when the loader says not found, not the error panel', async () => {
    renderRoute(() => Promise.reject(notFound()))
    expect(await screen.findByText('No such game')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(sendClientError).not.toHaveBeenCalled()
    expect(
      screen.getByRole('link', { name: 'Back to the Timeline' }),
    ).toBeTruthy()
  })

  it('defaults to a page', () => {
    const rootRoute = createRootRoute({
      component: () => <NotFoundPanel />,
    })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)
    return screen.findByText('No such page')
  })
})

describe('RoutePending', () => {
  it('holds the screen with skeletons while the loader waits', async () => {
    let finish = () => {}
    const loader = () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
    renderRoute(loader, { pending: () => <RoutePending shape="detail" /> })
    expect((await screen.findAllByRole('status')).length).toBe(2)
    finish()
    expect(await screen.findByText('Loaded')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
