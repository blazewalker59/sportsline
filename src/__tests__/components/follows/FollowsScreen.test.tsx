// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forever, renderScreen } from '../screenHarness'
import { FollowsScreen } from '@/components/follows/FollowsScreen'

// Server functions are Start RPC stubs a test can't serve, so the module
// is replaced: each fn answers like the server would.
const server = vi.hoisted(() => ({
  getViewerState: vi.fn(),
  searchFollowables: vi.fn(),
  setFollow: vi.fn(),
  setLeagueSettings: vi.fn(),
}))
vi.mock('@/lib/viewer/server', () => server)
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))
vi.mock('@/components/layout/AppHeader', () => ({
  AppHeader: () => <header>Sportsline</header>,
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const search = async (q: string) =>
  fireEvent.change(await screen.findByRole('searchbox'), {
    target: { value: q },
  })

describe('FollowsScreen', () => {
  it('holds the results’ place while a search runs', async () => {
    server.searchFollowables.mockReturnValue(forever())
    renderScreen(FollowsScreen)
    await search('Yankees')
    expect(
      await screen.findByRole('status', { name: 'Searching' }),
    ).toBeTruthy()
  })

  it('says a failed search failed rather than “No matches”, and Try again searches again', async () => {
    server.searchFollowables
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([])
    renderScreen(FollowsScreen)
    await search('Yankees')
    expect(
      await screen.findByText('Couldn’t load search results.'),
    ).toBeTruthy()
    expect(screen.queryByText('No matches.')).toBeNull()
    // The rest of the screen stands.
    expect(screen.getByText('Following')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No matches.')).toBeTruthy()
    expect(server.searchFollowables).toHaveBeenCalledTimes(2)
  })
})
