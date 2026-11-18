// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forever, renderScreen } from '../screenHarness'
import { PlayerScreen } from '@/components/players/PlayerScreen'
import { sendClientError } from '@/lib/ops/useClientErrors'
import { GENERIC_MESSAGE } from '@/lib/userError'

// Server functions are Start RPC stubs a test can't serve, so the module
// is replaced: each fn answers like the server would.
const server = vi.hoisted(() => ({ getPlayerPage: vi.fn() }))
vi.mock('@/lib/players/server', () => server)
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))
vi.mock('@/components/layout/AppHeader', () => ({
  AppHeader: () => <header>Sportsline</header>,
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const show = () =>
  renderScreen(() => <PlayerScreen playerId="p1" playId={null} />)

describe('PlayerScreen', () => {
  it('holds the page’s shape with skeletons while it loads', async () => {
    server.getPlayerPage.mockReturnValue(forever())
    show()
    // The header, their sections, their plays.
    expect((await screen.findAllByRole('status')).length).toBe(3)
  })

  it('says no such player when the read answers nothing', async () => {
    server.getPlayerPage.mockResolvedValue(null)
    show()
    expect(await screen.findByText('No such player')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Back to the Timeline' }),
    ).toBeTruthy()
  })

  it('says a failed load failed, and Try again reads the player again', async () => {
    server.getPlayerPage
      .mockRejectedValueOnce(new Error(GENERIC_MESSAGE))
      .mockResolvedValueOnce(null)
    show()
    expect(await screen.findByText('Couldn’t load this')).toBeTruthy()
    expect(screen.queryByText('No such player')).toBeNull()
    // The server reported this one already (its generic message says so).
    expect(sendClientError).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No such player')).toBeTruthy()
    expect(server.getPlayerPage).toHaveBeenCalledTimes(2)
  })
})
