// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forever, renderScreen } from '../screenHarness'
import { AlertsScreen } from '@/components/alerts/AlertsScreen'

// Server functions are Start RPC stubs a test can't serve, so the modules
// are replaced: each fn answers like the server would.
const push = vi.hoisted(() => ({
  getAlertLevels: vi.fn(),
  setAlertLevels: vi.fn(),
}))
vi.mock('@/lib/push/server', () => push)
vi.mock('@/lib/kalshi/server', () => ({
  getKalshiConnection: () => Promise.resolve(null),
}))
vi.mock('@/lib/fantasy/server', () => ({
  getEspnConnection: () => Promise.resolve(null),
  getSleeperConnection: () => Promise.resolve(null),
}))
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))
vi.mock('@/components/layout/AppHeader', () => ({
  AppHeader: () => <header>Sportsline</header>,
}))

const LEVELS = { following: 'scores', predictions: 'key', fantasy: 'key' }

beforeEach(() => {
  push.getAlertLevels.mockResolvedValue(LEVELS)
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('AlertsScreen', () => {
  it('holds the choices’ place while they load', async () => {
    push.getAlertLevels.mockReturnValue(forever())
    renderScreen(AlertsScreen)
    expect(
      await screen.findByRole('status', { name: 'Loading your Alert choices' }),
    ).toBeTruthy()
  })

  it('says the choices failed instead of leaving a gap, and Try again reads them again', async () => {
    push.getAlertLevels
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(LEVELS)
    renderScreen(AlertsScreen)
    expect(
      await screen.findByText('Couldn’t load your Alert choices.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('radiogroup', { name: 'Following Alerts' }),
    ).toBeTruthy()
    expect(push.getAlertLevels).toHaveBeenCalledTimes(2)
  })
})
