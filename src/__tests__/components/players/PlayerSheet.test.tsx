// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forever, renderScreen } from '../screenHarness'
import { PlayerSheet } from '@/components/players/PlayerProfile'

// Server functions are Start RPC stubs a test can't serve, so the module
// is replaced: each fn answers like the server would.
const server = vi.hoisted(() => ({ getPlayerPage: vi.fn() }))
vi.mock('@/lib/players/server', () => server)
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const show = () =>
  renderScreen(() => <PlayerSheet playerId="p1" onClose={() => {}} />)

describe('PlayerSheet', () => {
  it('holds the sheet’s shape while the Player loads', async () => {
    server.getPlayerPage.mockReturnValue(forever())
    show()
    // Their header, then their sections.
    expect((await screen.findAllByRole('status')).length).toBe(2)
  })

  it('says a failed load failed, not that the Player doesn’t exist, and Try again reads them again', async () => {
    server.getPlayerPage
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(null)
    show()
    expect(await screen.findByText('Couldn’t load this player.')).toBeTruthy()
    expect(screen.queryByText('Player not found.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Player not found.')).toBeTruthy()
    expect(server.getPlayerPage).toHaveBeenCalledTimes(2)
  })
})
