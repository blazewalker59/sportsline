// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderScreen } from '../screenHarness'
import type { PredictionView } from '@/lib/kalshi/predictionViews'
import { CashOutSheet, KalshiActions } from '@/components/predictions/CashOut'
import { HoldKey } from '@/components/signal/HoldKey'

const server = vi.hoisted(() => ({
  getKalshiLinks: vi.fn(),
  getCashOutPreview: vi.fn(),
  cashOutSingle: vi.fn(),
  requestCashOutQuote: vi.fn(),
  getCashOut: vi.fn(),
  acceptCashOutQuote: vi.fn(),
  cancelCashOutQuote: vi.fn(() => Promise.resolve({})),
}))
vi.mock('@/lib/kalshi/cashOutServer', () => server)
vi.mock('@/lib/kalshi/server', () => ({
  syncKalshiNow: () => Promise.resolve({}),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const prediction = (over: Partial<PredictionView> = {}): PredictionView => ({
  id: 'p1',
  kind: 'single',
  side: 'yes',
  title: 'Chiefs to win',
  contracts: 120,
  cost: 62.4,
  status: 'open',
  result: null,
  payout: null,
  pnl: null,
  openedAt: '2026-11-26T20:00:00Z',
  settledAt: null,
  chance: 0.62,
  entryChance: 0.52,
  value: 73.2,
  history: [],
  legs: [],
  ...over,
})

const preview = (over: object = {}) => ({
  kind: 'single',
  side: 'yes',
  title: 'Chiefs to win',
  held: 120,
  trading: true,
  single: { open: true, cents: 60, limitCents: 58 },
  ...over,
})

describe('KalshiActions', () => {
  it('opens the market on Kalshi and offers Cash out at its value', async () => {
    server.getKalshiLinks.mockResolvedValue({
      market: 'https://kalshi.com/markets/kxnflgame/kxnflgame-26nov26kcbuf',
      portfolio: 'https://kalshi.com/portfolio',
      legs: {},
    })
    renderScreen(() => <KalshiActions prediction={prediction()} />)
    const open = await screen.findByRole('link', {
      name: 'Open this market in Kalshi',
    })
    expect(open.getAttribute('href')).toBe(
      'https://kalshi.com/markets/kxnflgame/kxnflgame-26nov26kcbuf',
    )
    expect(open.getAttribute('target')).toBe('_blank')
    expect(
      screen.getByRole('button', { name: /Cash out\s*\$73\.20/ }),
    ).toBeTruthy()
  })

  it('sends a Combo to the portfolio and marks its value an estimate', async () => {
    server.getKalshiLinks.mockResolvedValue({
      market: null,
      portfolio: 'https://kalshi.com/portfolio',
      legs: {},
    })
    renderScreen(() => (
      <KalshiActions prediction={prediction({ kind: 'combo', value: 22.02 })} />
    ))
    expect(
      (
        await screen.findByRole('link', { name: 'Open your Kalshi portfolio' })
      ).getAttribute('href'),
    ).toBe('https://kalshi.com/portfolio')
    expect(
      screen.getByRole('button', { name: /Cash out\s*≈\s*\$22\.02/ }),
    ).toBeTruthy()
  })

  it('offers no Cash out once settled', async () => {
    server.getKalshiLinks.mockResolvedValue(null)
    renderScreen(() => (
      <KalshiActions
        prediction={prediction({ status: 'settled', result: 'won' })}
      />
    ))
    expect(await screen.findByText(/Open in Kalshi/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Cash out/ })).toBeNull()
  })
})

describe('CashOutSheet', () => {
  it('asks for a trade key when none is connected', async () => {
    server.getCashOutPreview.mockResolvedValue(preview({ trading: false }))
    renderScreen(() => (
      <CashOutSheet prediction={prediction()} onClose={() => {}} />
    ))
    expect(
      await screen.findByRole('link', { name: 'Connect a trade key' }),
    ).toBeTruthy()
  })

  it('shows what a single brings after fees, and sells it once confirmed', async () => {
    server.getCashOutPreview.mockResolvedValue(preview())
    server.cashOutSingle.mockResolvedValue({
      id: 'x',
      status: 'filled',
      kind: 'single',
      side: 'yes',
      count: 120,
      filledCount: 120,
      avgPriceDollars: 0.6,
      feesDollars: 2.02,
      quote: null,
      error: null,
    })
    renderScreen(() => (
      <CashOutSheet prediction={prediction()} onClose={() => {}} />
    ))
    // 120 × 60¢ = $72.00, less Kalshi's $2.02.
    expect(await screen.findByText('$69.98')).toBeTruthy()
    expect(screen.getByText(/58¢/)).toBeTruthy()
    const hold = screen.getByRole('button', { name: /Hold to cash out/ })
    fireEvent.click(hold)
    expect(
      screen.getByRole('button', { name: /Press again to confirm/ }),
    ).toBeTruthy()
    fireEvent.click(hold)
    expect(await screen.findByText('Sold')).toBeTruthy()
    const sent = server.cashOutSingle.mock.calls[0][0].data
    expect(sent).toMatchObject({
      predictionId: 'p1',
      count: 120,
      limitCents: 58,
    })
  })

  it('asks market makers for a Combo’s price, then sells at the one accepted', async () => {
    server.getCashOutPreview.mockResolvedValue(
      preview({ kind: 'combo', held: 20, single: null }),
    )
    const quoting = {
      id: 'x',
      status: 'quoting',
      kind: 'combo',
      side: 'yes',
      count: 20,
      filledCount: null,
      avgPriceDollars: null,
      feesDollars: null,
      quote: null,
      error: null,
    }
    server.requestCashOutQuote.mockResolvedValue(quoting)
    server.getCashOut.mockResolvedValue({
      ...quoting,
      quote: { id: 'q2', price: 0.312, gross: 6.24, fees: 0.31, net: 5.93 },
    })
    server.acceptCashOutQuote.mockResolvedValue({
      ...quoting,
      status: 'filled',
      filledCount: 20,
      avgPriceDollars: 0.312,
      feesDollars: 0.31,
    })
    renderScreen(() => (
      <CashOutSheet
        prediction={prediction({ kind: 'combo', contracts: 20, value: 6.6 })}
        onClose={() => {}}
      />
    ))
    fireEvent.click(await screen.findByRole('button', { name: 'Get a price' }))
    const hold = await screen.findByRole('button', {
      name: /Hold to sell at 31¢/,
    })
    expect(screen.getByText('$5.93')).toBeTruthy()
    fireEvent.click(hold)
    fireEvent.click(hold)
    expect(await screen.findByText('Sold')).toBeTruthy()
    expect(server.acceptCashOutQuote.mock.calls[0][0].data).toMatchObject({
      quoteId: 'q2',
      price: 0.312,
    })
  })
})

describe('a Combo’s quotes that can’t be read', () => {
  it('says so, instead of waiting it out as if no one quoted', async () => {
    server.getCashOutPreview.mockResolvedValue(
      preview({ kind: 'combo', held: 20, single: null }),
    )
    server.requestCashOutQuote.mockResolvedValue({
      id: 'x',
      status: 'quoting',
      kind: 'combo',
      side: 'yes',
      count: 20,
      filledCount: null,
      avgPriceDollars: null,
      feesDollars: null,
      quote: null,
      error: null,
    })
    server.getCashOut.mockRejectedValue(new Error('Kalshi didn’t answer.'))
    renderScreen(() => (
      <CashOutSheet
        prediction={prediction({ kind: 'combo', contracts: 20, value: 6.6 })}
        onClose={() => {}}
      />
    ))
    fireEvent.click(await screen.findByRole('button', { name: 'Get a price' }))
    expect(
      await screen.findByText('Couldn’t read prices', {}, { timeout: 5000 }),
    ).toBeTruthy()
    expect(screen.queryByText('No price came in')).toBeNull()
    expect(screen.getByRole('button', { name: 'Ask again' })).toBeTruthy()
  })
})

describe('HoldKey', () => {
  it('confirms after a hold, and not on a short press', () => {
    vi.useFakeTimers()
    let t = 0
    // A frame every 16 ms of fake time, each 100 ms of hold.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return setTimeout(() => {
        t += 100
        cb(t)
      }, 16) as unknown as number
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) =>
      clearTimeout(id),
    )
    const confirm = vi.fn()
    render(<HoldKey onConfirm={confirm}>Hold to cash out</HoldKey>)
    const key = screen.getByRole('button')
    fireEvent.pointerDown(key, { pointerId: 1 })
    vi.advanceTimersByTime(16 * 3)
    fireEvent.pointerUp(key, { pointerId: 1 })
    vi.advanceTimersByTime(1000)
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.pointerDown(key, { pointerId: 1 })
    vi.advanceTimersByTime(16 * 12)
    expect(confirm).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
