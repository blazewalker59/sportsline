// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('leaves the main navigation’s destinations to it', async () => {
    const menu = await openMenu()
    const hrefs = Array.from(menu.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).not.toContain('/predictions')
    expect(hrefs).not.toContain('/fantasy')
    expect(hrefs).not.toContain('/follows')
  })
})
