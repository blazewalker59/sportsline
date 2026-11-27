// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forever, renderScreen } from '../screenHarness'
import type { ApiTokenRow, TradingState } from '@/lib/agents/server'
import { AgentsScreen } from '@/components/agents/AgentsScreen'

// Server functions are Start RPC stubs a test can't serve, so the module
// is replaced: each fn answers like the server would.
const server = vi.hoisted(() => ({
  getApiTokens: vi.fn(),
  getTrading: vi.fn(),
  getBetRecord: vi.fn(),
}))
vi.mock('@/lib/agents/server', () => server)
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))
vi.mock('@/components/layout/AppHeader', () => ({
  AppHeader: () => <header>Sportsline</header>,
}))

const TOKEN: ApiTokenRow = {
  id: 't1',
  name: 'Grok',
  prefix: 'sl_ab12',
  scopes: ['read'],
  createdAt: '2026-11-01T12:00:00Z',
  lastUsedAt: null,
}
const NO_KEY: TradingState = { key: null, spentToday: 0, trades: [] }

beforeEach(() => {
  server.getApiTokens.mockResolvedValue([TOKEN])
  server.getTrading.mockResolvedValue(NO_KEY)
  server.getBetRecord.mockResolvedValue(null)
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('AgentsScreen', () => {
  it('holds each part’s place while it loads', async () => {
    server.getApiTokens.mockReturnValue(forever())
    server.getTrading.mockReturnValue(forever())
    renderScreen(AgentsScreen)
    expect(
      await screen.findByRole('status', { name: 'Loading your tokens' }),
    ).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading trading' })).toBeTruthy()
  })

  it('a failed trading read fails in place, the tokens still show, and Try again reads it again', async () => {
    server.getTrading
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(NO_KEY)
    renderScreen(AgentsScreen)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Couldn’t load trading.')).toBeTruthy()
    expect(await screen.findByText('Grok')).toBeTruthy()
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('button', { name: 'Connect trade key' }),
    ).toBeTruthy()
    expect(server.getTrading).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a failed tokens read says so instead of “None yet”, and retries', async () => {
    server.getApiTokens
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([TOKEN])
    renderScreen(AgentsScreen)
    expect(await screen.findByText('Couldn’t load your tokens.')).toBeTruthy()
    expect(screen.queryByText('None yet.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Grok')).toBeTruthy()
    expect(server.getApiTokens).toHaveBeenCalledTimes(2)
  })

  it('a proposal shows its window as a dial, Reject beside an inked Approve', async () => {
    const now = Date.now()
    server.getTrading.mockResolvedValue({
      key: null,
      spentToday: 0,
      trades: [
        {
          id: 'tp1',
          viewerId: 'v1',
          tokenId: 't1',
          agentName: 'Claude',
          marketTicker: 'KXNFL-KC',
          marketTitle: 'Chiefs to win',
          side: 'yes',
          action: 'buy',
          count: 40,
          limitCents: 66,
          maxCostDollars: 26.4,
          note: null,
          status: 'pending',
          createdAt: new Date(now - 3 * 60_000).toISOString(),
          expiresAt: new Date(now + 7 * 60_000).toISOString(),
          decidedAt: null,
          approvedDay: null,
          orderId: null,
          filledCount: null,
          avgPriceDollars: null,
          feesDollars: null,
          error: null,
        },
      ],
    } satisfies TradingState)
    renderScreen(AgentsScreen)
    const dial = await screen.findByRole('img', { name: /min left to decide/ })
    // 30 segments, the time left lit, the last lit one orange.
    const segments = dial.querySelectorAll('rect')
    expect(segments.length).toBe(30)
    expect(dial.querySelectorAll('rect.fill-signal').length).toBe(1)
    expect(
      dial.querySelectorAll('rect.fill-foreground').length,
    ).toBeGreaterThan(15)
    const approve = screen.getByRole('button', { name: 'Approve' })
    expect(approve.className).toContain('key-ink')
    expect(
      screen.getByRole('button', { name: 'Reject' }).className,
    ).not.toContain('key-ink')
  })
})
