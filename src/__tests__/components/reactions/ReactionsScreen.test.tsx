// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forever, renderScreen } from '../screenHarness'
import { ReactionsScreen } from '@/components/reactions/ReactionsScreen'
import { sendClientError } from '@/lib/ops/useClientErrors'

// Server functions are Start RPC stubs a test can't serve, so the module
// is replaced: each fn answers like the server would.
const server = vi.hoisted(() => ({ getMyReactions: vi.fn() }))
vi.mock('@/lib/reactions/server', () => server)
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))
vi.mock('@/components/layout/AppHeader', () => ({
  AppHeader: () => <header>Sportsline</header>,
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const show = () => renderScreen(() => <ReactionsScreen playId={null} />)

describe('ReactionsScreen', () => {
  it('shows bubbles while the Reactions load', async () => {
    server.getMyReactions.mockReturnValue(forever())
    show()
    expect(
      await screen.findByRole('status', { name: 'Loading Reactions' }),
    ).toBeTruthy()
  })

  it('says a failed load failed rather than showing no Reactions, and Try again reads them again', async () => {
    const boom = new Error('offline')
    server.getMyReactions
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce({ reactions: [], nextBefore: null })
    show()
    expect(await screen.findByText('Couldn’t load this')).toBeTruthy()
    expect(screen.queryByText(/Long-press any Play/)).toBeNull()
    expect(sendClientError).toHaveBeenCalledWith(boom, 'query')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/Long-press any Play/)).toBeTruthy()
    expect(server.getMyReactions).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
