// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forever, renderScreen } from '../screenHarness'
import type { KalshiConnection } from '@/lib/kalshi/server'
import { PredictionsScreen } from '@/components/predictions/PredictionsScreen'
import { sendClientError } from '@/lib/ops/useClientErrors'

// Server functions are Start RPC stubs a test can't serve, so the modules
// are replaced: each fn answers like the server would.
const kalshi = vi.hoisted(() => ({
  getKalshiConnection: vi.fn(),
  getPredictions: vi.fn(),
  getPredictionRecord: vi.fn(),
}))
vi.mock('@/lib/kalshi/server', () => kalshi)
vi.mock('@/lib/kalshi/predictionViews', () => kalshi)
const sharp = vi.hoisted(() => ({
  getSharpSlate: vi.fn(),
  getSharpHistory: vi.fn(),
}))
vi.mock('@/lib/sharp/server', () => sharp)
vi.mock('@/lib/ops/useClientErrors', () => ({ sendClientError: vi.fn() }))
vi.mock('@/components/layout/AppHeader', () => ({
  AppHeader: () => <header>Sportsline</header>,
}))

const CONNECTED: KalshiConnection = {
  keyId: 'k1',
  status: 'ok',
  lastError: null,
  syncedAt: '2026-11-17T12:00:00Z',
  changeDisplay: 'dollars',
}

beforeEach(() => {
  kalshi.getKalshiConnection.mockResolvedValue(CONNECTED)
  kalshi.getPredictions.mockResolvedValue([])
  kalshi.getPredictionRecord.mockResolvedValue([])
  sharp.getSharpSlate.mockResolvedValue(null)
  sharp.getSharpHistory.mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('PredictionsScreen', () => {
  it('holds the page’s shape while the connection is checked', async () => {
    kalshi.getKalshiConnection.mockReturnValue(forever())
    renderScreen(PredictionsScreen)
    expect((await screen.findAllByRole('status')).length).toBe(2)
  })

  it('a failed connection check says so, not “connect Kalshi”, and Try again checks again', async () => {
    const boom = new Error('offline')
    kalshi.getKalshiConnection
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce(null)
    renderScreen(PredictionsScreen)
    expect(await screen.findByText('Couldn’t load this')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect Kalshi' })).toBeNull()
    expect(sendClientError).toHaveBeenCalledWith(boom, 'query')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('button', { name: 'Connect Kalshi' }),
    ).toBeTruthy()
    expect(kalshi.getKalshiConnection).toHaveBeenCalledTimes(2)
  })

  it('failed Predictions fail in place, the rest stands, and Try again reads them again', async () => {
    kalshi.getPredictions
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([])
    renderScreen(PredictionsScreen)
    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByText('Couldn’t load your Predictions.'),
    ).toBeTruthy()
    expect(screen.getByText('Kalshi connected')).toBeTruthy()
    expect(await screen.findByText('Your record')).toBeTruthy()
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/No open Predictions/)).toBeTruthy()
    expect(kalshi.getPredictions).toHaveBeenCalledTimes(2)
  })

  it('a failed record fails in place under the list', async () => {
    kalshi.getPredictionRecord
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([])
    renderScreen(PredictionsScreen)
    expect(await screen.findByText('Couldn’t load your record.')).toBeTruthy()
    expect(await screen.findByText(/No open Predictions/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByText('No predictions in this range.'),
    ).toBeTruthy()
    expect(kalshi.getPredictionRecord).toHaveBeenCalledTimes(2)
  })
})
