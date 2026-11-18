// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forever, renderScreen } from '../screenHarness'
import { TeamScreen } from '@/components/teams/TeamScreen'
import { sendClientError } from '@/lib/ops/useClientErrors'

// Server functions are Start RPC stubs a test can't serve, so the module
// is replaced: each fn answers like the server would.
const server = vi.hoisted(() => ({
  getTeamPage: vi.fn(),
  openTeamGame: vi.fn(),
}))
vi.mock('@/lib/teams/server', () => server)
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))
vi.mock('@/components/layout/AppHeader', () => ({
  AppHeader: () => <header>Sportsline</header>,
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const show = () => renderScreen(() => <TeamScreen teamId="nfl-buf" />)

describe('TeamScreen', () => {
  it('holds the page’s shape with skeletons while it loads', async () => {
    server.getTeamPage.mockReturnValue(forever())
    show()
    expect((await screen.findAllByRole('status')).length).toBe(2)
    expect(screen.queryByText(/not found|No such/)).toBeNull()
  })

  it('says no such team when the read answers nothing', async () => {
    server.getTeamPage.mockResolvedValue(null)
    show()
    expect(await screen.findByText('No such team')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(sendClientError).not.toHaveBeenCalled()
  })

  it('says a failed load failed, not that the team doesn’t exist, and reports it', async () => {
    const boom = new Error('network down')
    server.getTeamPage.mockRejectedValue(boom)
    show()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Couldn’t load this')).toBeTruthy()
    expect(screen.queryByText('No such team')).toBeNull()
    expect(sendClientError).toHaveBeenCalledWith(boom, 'query')
  })

  it('Try again reads the team again', async () => {
    server.getTeamPage
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValueOnce(null)
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    // The second answer (no such team) shows: it really asked again.
    expect(await screen.findByText('No such team')).toBeTruthy()
    expect(server.getTeamPage).toHaveBeenCalledTimes(2)
  })

  it('stays on the error when the retry fails too', async () => {
    server.getTeamPage.mockRejectedValue(new Error('still down'))
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(server.getTeamPage).toHaveBeenCalledTimes(2))
    expect(
      await screen.findByRole('button', { name: 'Try again' }),
    ).toBeTruthy()
  })
})
