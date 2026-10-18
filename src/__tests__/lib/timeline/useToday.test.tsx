// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeSocket } from '../../helpers/fakeSocket'
import { getTimeline } from '@/lib/timeline/server'
import { useLiveTimeline } from '@/lib/timeline/useLiveTimeline'
import { useToday } from '@/lib/timeline/useToday'

vi.mock('@/lib/timeline/server', () => ({
  getTimeline: vi.fn(({ data }: { data: { sportsDay: string } }) =>
    Promise.resolve({ sportsDay: data.sportsDay, items: [], nextBefore: null }),
  ),
  getGames: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/lib/games/server', () => ({
  getGameDetail: vi.fn(() => Promise.resolve(null)),
  getPlayDetail: vi.fn(() => Promise.resolve(null)),
}))

// 6am Eastern (EDT) on 18 October is 10:00 UTC.
const BEFORE = new Date('2026-10-18T09:59:30Z')
const AFTER = new Date('2026-10-18T10:00:30Z')

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(BEFORE)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setVisibility('visible')
})

describe('useToday', () => {
  it('rolls over at 6am Eastern while the app stays open', () => {
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-10-17')

    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current).toBe('2026-10-17')
    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current).toBe('2026-10-18')
  })

  it('catches up as soon as a backgrounded tab is back in view', () => {
    const { result } = renderHook(() => useToday())
    act(() => setVisibility('hidden'))
    // Hidden tabs' timers barely run: the clock moves on without them.
    vi.setSystemTime(AFTER)
    expect(result.current).toBe('2026-10-17')

    act(() => setVisibility('visible'))
    expect(result.current).toBe('2026-10-18')
  })

  it("moves today's live Timeline on to the new day", async () => {
    FakeSocket.reset()
    vi.stubGlobal('WebSocket', FakeSocket)
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(
      () => {
        const today = useToday()
        return { today, timeline: useLiveTimeline([], today, today) }
      },
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        ),
      },
    )
    await waitFor(() => expect(result.current.timeline.loading).toBe(false))
    const days = () =>
      vi.mocked(getTimeline).mock.calls.map(([arg]) => arg.data.sportsDay)
    expect(days()).toContain('2026-10-17')
    expect(days()).not.toContain('2026-10-18')

    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current.today).toBe('2026-10-18')
    await waitFor(() => expect(days()).toContain('2026-10-18'))
    // Still the one live socket: it isn't per day.
    expect(FakeSocket.all).toHaveLength(1)
  })
})
