// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forever, renderScreen } from '../screenHarness'
import type { EspnConnection } from '@/lib/fantasy/server'
import { FantasyScreen } from '@/components/fantasy/FantasyScreen'

// Server functions are Start RPC stubs a test can't serve, so the module
// is replaced: each fn answers like the server would.
const server = vi.hoisted(() => ({
  getEspnConnection: vi.fn(),
  getSleeperConnection: vi.fn(),
  getFantasy: vi.fn(),
}))
vi.mock('@/lib/fantasy/server', () => server)
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))
vi.mock('@/components/layout/AppHeader', () => ({
  AppHeader: () => <header>Sportsline</header>,
}))

const ESPN: EspnConnection = {
  status: 'ok',
  lastError: null,
  syncedAt: '2026-11-17T12:00:00Z',
  movesEnabled: false,
}

beforeEach(() => {
  server.getEspnConnection.mockResolvedValue(ESPN)
  server.getSleeperConnection.mockResolvedValue(null)
  server.getFantasy.mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('FantasyScreen', () => {
  it('holds the page’s shape while the connections are checked', async () => {
    server.getEspnConnection.mockReturnValue(forever())
    renderScreen(FantasyScreen)
    expect(
      await screen.findByRole('status', { name: 'Loading your connections' }),
    ).toBeTruthy()
  })

  it('a failed connection check says so, not “Connect”, and Try again checks again', async () => {
    server.getEspnConnection
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(null)
    renderScreen(FantasyScreen)
    expect(await screen.findByText('Couldn’t load this')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      (await screen.findAllByRole('button', { name: 'Connect' })).length,
    ).toBe(2)
    expect(server.getEspnConnection).toHaveBeenCalledTimes(2)
  })

  it('shows skeletons while the leagues load', async () => {
    server.getFantasy.mockReturnValue(forever())
    renderScreen(FantasyScreen)
    expect(
      (await screen.findAllByRole('status', { name: 'Loading your leagues' }))
        .length,
    ).toBe(2)
  })

  it('failed leagues fail in place under the connections, and Try again reads them again', async () => {
    server.getFantasy
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([])
    renderScreen(FantasyScreen)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Couldn’t load your leagues.')).toBeTruthy()
    expect(screen.getByText('Connections')).toBeTruthy()
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/No leagues found yet/)).toBeTruthy()
    expect(server.getFantasy).toHaveBeenCalledTimes(2)
  })
})
