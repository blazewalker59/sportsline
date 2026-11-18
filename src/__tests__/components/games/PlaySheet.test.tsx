// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forever, renderScreen } from '../screenHarness'
import { PlaySheet } from '@/components/games/PlayDetailScreen'

// Server functions are Start RPC stubs a test can't serve, so the module
// is replaced: each fn answers like the server would.
const server = vi.hoisted(() => ({ getPlayDetail: vi.fn() }))
vi.mock('@/lib/games/server', () => server)
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const show = () =>
  renderScreen(() => <PlaySheet playId="play1" onClose={() => {}} />)

describe('PlaySheet', () => {
  it('holds the sheet’s shape while the Play loads', async () => {
    server.getPlayDetail.mockReturnValue(forever())
    show()
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeTruthy()
  })

  it('says a failed load failed, not that the Play doesn’t exist, and Try again reads it again', async () => {
    server.getPlayDetail
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(null)
    show()
    expect(await screen.findByText('Couldn’t load this play.')).toBeTruthy()
    expect(screen.queryByText('Play not found.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Play not found.')).toBeTruthy()
    expect(server.getPlayDetail).toHaveBeenCalledTimes(2)
  })
})
