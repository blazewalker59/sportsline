/**
 * Renders a screen the way the app does, minus the network: a fresh query
 * client (no retries, so a failure shows at once) holding a signed-in
 * Viewer, under a real memory router opened at /screen with a Timeline at
 * /. Each test file mocks the server modules its screen reads.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { ViewerState } from '@/lib/viewer/server'
import { DEFAULT_LEAGUE_SETTINGS } from '@/lib/model/leagues'
import { VIEWER_KEY } from '@/lib/viewer/queries'

export function viewerState(over: Partial<ViewerState> = {}): ViewerState {
  return {
    viewer: { id: 'u1', name: 'V', image: null, email: 'v@example.com' },
    follows: [],
    readAt: null,
    leagues: DEFAULT_LEAGUE_SETTINGS,
    priceDisplay: 'cents',
    firstRunDone: true,
    ...over,
  }
}

export function renderScreen(
  Screen: () => React.ReactNode,
  { viewer = viewerState() }: { viewer?: ViewerState } = {},
) {
  const queryClient = new QueryClient({
    // Nothing goes stale by itself: a fetch after the first is a refetch
    // the screen asked for.
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData(VIEWER_KEY, viewer)
  const rootRoute = createRootRoute()
  const timeline = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <p>Timeline</p>,
  })
  const screen = createRoute({
    getParentRoute: () => rootRoute,
    path: '/screen',
    component: Screen,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([timeline, screen]),
    history: createMemoryHistory({ initialEntries: ['/screen'] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

/** A promise that never settles: a query held loading. */
export function forever<T>(): Promise<T> {
  return new Promise<T>(() => {})
}
