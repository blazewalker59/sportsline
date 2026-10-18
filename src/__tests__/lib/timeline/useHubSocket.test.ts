// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeSocket } from '../../helpers/fakeSocket'
import { backoffMs, useHubSocket } from '@/lib/timeline/useHubSocket'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

function render(query: string | null = 'game=g1') {
  const onEvents = vi.fn()
  const onReconnect = vi.fn()
  const hook = renderHook(() => useHubSocket(query, onEvents, onReconnect))
  return { ...hook, onEvents, onReconnect }
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeSocket.reset()
  vi.stubGlobal('WebSocket', FakeSocket)
  // The middle of the jitter range: half the ceiling plus a quarter.
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setVisibility('visible')
})

describe('backoffMs', () => {
  it('doubles to a 30s cap, landing in the upper half of each step', () => {
    expect(backoffMs(1, 0)).toBe(1000)
    expect(backoffMs(1, 1)).toBe(2000)
    expect(backoffMs(3, 0)).toBe(4000)
    expect(backoffMs(3, 1)).toBe(8000)
    expect(backoffMs(10, 0)).toBe(15_000)
    expect(backoffMs(10, 1)).toBe(30_000)
  })
})

describe('useHubSocket', () => {
  it('connects to the LiveHub with its query and passes events on', () => {
    const { result, onEvents } = render()
    expect(FakeSocket.all).toHaveLength(1)
    expect(FakeSocket.latest.url).toMatch(/\/live\?game=g1$/)
    expect(result.current).toBe('connecting')

    act(() => FakeSocket.latest.open())
    expect(result.current).toBe('live')

    const events = [{ type: 'remove', id: 'p1', gameId: 'g1' }]
    act(() => FakeSocket.latest.message('pong'))
    act(() => FakeSocket.latest.message('not json'))
    act(() => FakeSocket.latest.message(events))
    expect(onEvents).toHaveBeenCalledTimes(1)
    expect(onEvents).toHaveBeenCalledWith(events)
  })

  it('opens nothing without a query', () => {
    render(null)
    expect(FakeSocket.all).toHaveLength(0)
  })

  it('reconnects with backoff after a drop, then asks for the gap', () => {
    const { result, onReconnect } = render()
    act(() => FakeSocket.latest.open())
    expect(onReconnect).not.toHaveBeenCalled()

    act(() => FakeSocket.latest.drop())
    expect(result.current).toBe('offline')
    // First retry: a 2s ceiling, 1.5s at the middle of its jitter.
    act(() => vi.advanceTimersByTime(1499))
    expect(FakeSocket.all).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(FakeSocket.all).toHaveLength(2)

    // It fails too: the next wait doubles.
    act(() => FakeSocket.latest.drop())
    act(() => vi.advanceTimersByTime(2999))
    expect(FakeSocket.all).toHaveLength(2)
    act(() => vi.advanceTimersByTime(1))
    expect(FakeSocket.all).toHaveLength(3)

    act(() => FakeSocket.latest.open())
    expect(result.current).toBe('live')
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('reconnects straight away when the device comes back online', () => {
    const { onReconnect } = render()
    act(() => FakeSocket.latest.open())
    act(() => FakeSocket.latest.drop())
    // Still waiting on the backoff.
    expect(FakeSocket.all).toHaveLength(1)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(FakeSocket.all).toHaveLength(2)
    act(() => FakeSocket.latest.open())
    expect(onReconnect).toHaveBeenCalledTimes(1)

    // The backoff it skipped doesn't fire a second socket later.
    act(() => vi.advanceTimersByTime(60_000))
    expect(FakeSocket.all).toHaveLength(2)
  })

  it('resets the backoff when reconnecting on demand', () => {
    render()
    act(() => FakeSocket.latest.drop())
    act(() => vi.advanceTimersByTime(1500))
    act(() => FakeSocket.latest.drop())
    act(() => vi.advanceTimersByTime(3000))
    act(() => FakeSocket.latest.drop())
    expect(FakeSocket.all).toHaveLength(3)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(FakeSocket.all).toHaveLength(4)
    // Dropped again: back to the first step, not the fourth.
    act(() => FakeSocket.latest.drop())
    act(() => vi.advanceTimersByTime(1500))
    expect(FakeSocket.all).toHaveLength(5)
  })

  it('reconnects straight away when the tab comes back into view', () => {
    render()
    act(() => FakeSocket.latest.open())
    act(() => FakeSocket.latest.drop())

    act(() => setVisibility('hidden'))
    expect(FakeSocket.all).toHaveLength(1)
    act(() => setVisibility('visible'))
    expect(FakeSocket.all).toHaveLength(2)
  })

  it('leaves a connected socket alone when the tab comes back', () => {
    render()
    act(() => FakeSocket.latest.open())
    act(() => setVisibility('visible'))
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(FakeSocket.all).toHaveLength(1)
  })

  it('pings while connected', () => {
    render()
    act(() => FakeSocket.latest.open())
    act(() => vi.advanceTimersByTime(25_000))
    expect(FakeSocket.latest.sent).toEqual(['ping'])
  })

  it('closes on unmount and never reconnects', () => {
    const { unmount } = render()
    const socket = FakeSocket.latest
    act(() => socket.open())
    unmount()
    expect(socket.closed).toBe(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
      vi.advanceTimersByTime(60_000)
    })
    expect(FakeSocket.all).toHaveLength(1)
  })
})
