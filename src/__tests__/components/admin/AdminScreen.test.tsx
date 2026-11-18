// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forever, renderScreen } from '../screenHarness'
import { AdminScreen } from '@/components/admin/AdminScreen'
import { sendClientError } from '@/lib/ops/useClientErrors'

// Server functions are Start RPC stubs a test can't serve, so the module
// is replaced: each fn answers like the server would.
const server = vi.hoisted(() => ({ getOpsHealth: vi.fn() }))
vi.mock('@/lib/ops/server', () => server)
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))
vi.mock('@/components/layout/AppHeader', () => ({
  AppHeader: () => <header>Sportsline</header>,
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('AdminScreen', () => {
  it('holds the page’s shape with a skeleton while it loads', async () => {
    server.getOpsHealth.mockReturnValue(forever())
    renderScreen(AdminScreen)
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeTruthy()
  })

  it('says a failed load failed, and Try again reads the health again', async () => {
    const boom = new Error('D1 timed out')
    server.getOpsHealth
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce({ denied: true, email: 'v@example.com' })
    renderScreen(AdminScreen)
    expect(await screen.findByText('Couldn’t load this')).toBeTruthy()
    // The raw message isn't shown.
    expect(screen.queryByText(/D1 timed out/)).toBeNull()
    expect(sendClientError).toHaveBeenCalledWith(boom, 'query')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/which isn’t an admin/)).toBeTruthy()
    expect(server.getOpsHealth).toHaveBeenCalledTimes(2)
  })
})
