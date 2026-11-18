// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ViewerState } from '@/lib/viewer/server'
import { AppHeader } from '@/components/layout/AppHeader'
import { VIEWER_KEY } from '@/lib/viewer/queries'

const viewer = {
  viewer: {
    id: 'v1',
    name: 'Sam Viewer',
    email: 'sam@example.com',
    image: null,
  },
  follows: [],
  readAt: null,
  leagues: { order: [], hidden: [] },
  isAdmin: true,
} as unknown as ViewerState

async function openMenu() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData(VIEWER_KEY, viewer)
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AppHeader /> }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await act(async () => {
    await router.load()
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Account' }))
  return screen.getByRole('navigation', { name: 'Account' })
}

describe('AppHeader account menu', () => {
  afterEach(cleanup)

  it('keeps Reactions, Alerts, Agents, Health and sign-out', async () => {
    const menu = await openMenu()
    for (const label of ['Reactions', 'Alerts', 'Agents', 'Health']) {
      expect(menu.textContent).toContain(label)
    }
    expect(menu.textContent).toContain('Sign out')
  })

  it('has the screens for managing Follows, Predictions and Fantasy', async () => {
    const menu = await openMenu()
    const items = Array.from(menu.querySelectorAll('a')).map((a) => [
      a.getAttribute('href'),
      a.textContent,
    ])
    expect(items.slice(0, 3)).toEqual([
      ['/follows', 'FollowsTeams, Players, your League row'],
      ['/predictions', 'PredictionsRecord and Kalshi connection'],
      ['/fantasy', 'FantasyLeagues and connections'],
    ])
    // Under a heading that says what they're for.
    expect(menu.textContent).toContain('Manage')
  })

  it('closes when one is picked', async () => {
    const menu = await openMenu()
    fireEvent.click(within(menu).getByRole('link', { name: /^Predictions/ }))
    expect(screen.queryByRole('navigation', { name: 'Account' })).toBeNull()
  })
})
