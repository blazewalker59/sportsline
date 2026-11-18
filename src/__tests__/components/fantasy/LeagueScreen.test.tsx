// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forever, renderScreen } from '../screenHarness'
import { LeagueScreen } from '@/components/fantasy/LeagueScreen'
import { sendClientError } from '@/lib/ops/useClientErrors'
import { UserError } from '@/lib/userError'

// Server functions are Start RPC stubs a test can't serve, so the module
// is replaced: each fn answers like the server would.
const server = vi.hoisted(() => ({ getFantasyLeague: vi.fn() }))
vi.mock('@/lib/fantasy/server', () => server)
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))
vi.mock('@/components/layout/AppHeader', () => ({
  AppHeader: () => <header>Sportsline</header>,
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const show = () => renderScreen(() => <LeagueScreen leagueId="lg1" />)

describe('LeagueScreen', () => {
  it('holds the page’s shape with a skeleton while it loads', async () => {
    server.getFantasyLeague.mockReturnValue(forever())
    show()
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeTruthy()
  })

  it('says no such fantasy league when the read answers nothing', async () => {
    server.getFantasyLeague.mockResolvedValue(null)
    show()
    expect(await screen.findByText('No such fantasy league')).toBeTruthy()
  })

  it('shows a UserError in its own words without reporting it, and retries', async () => {
    server.getFantasyLeague
      .mockRejectedValueOnce(new UserError('ESPN is not answering'))
      .mockResolvedValueOnce(null)
    show()
    expect(await screen.findByText('ESPN is not answering')).toBeTruthy()
    expect(screen.queryByText('No such fantasy league')).toBeNull()
    expect(sendClientError).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No such fantasy league')).toBeTruthy()
    expect(server.getFantasyLeague).toHaveBeenCalledTimes(2)
  })
})
