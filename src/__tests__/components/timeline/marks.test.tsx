// @vitest-environment happy-dom
/**
 * The Timeline's small marks: a one-row tile's stakes, each by its tab's
 * icon, and the connection, said only while it's missing.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gameSummary } from './fixtures'
import { LiveBoard } from '@/components/timeline/LiveBoard'
import { ConnectionDot } from '@/components/timeline/TimelineControls'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a one-row tile’s stakes', () => {
  it('marks each stake with its own icon, and names them', () => {
    const game = gameSummary(
      { id: 'g1', league: 'nfl', status: 'scheduled' },
      '2026-11-29',
    )
    const { container } = render(
      <LiveBoard
        pages={[{ kind: 'game', id: 'g1', game }]}
        current="all"
        stakesOf={() => ['following', 'fantasy']}
        layout="row"
        onLayout={() => {}}
        onPick={() => {}}
      />,
    )
    const tile = screen
      .getAllByRole('button')
      .find((b) => b.textContent.includes('PHI'))!
    expect(tile.textContent).toContain('Following, Fantasy')
    // Two different icons, not two identical dots.
    const icons = [...tile.querySelectorAll('svg')].map((s) => s.innerHTML)
    expect(icons).toHaveLength(2)
    expect(icons[0]).not.toBe(icons[1])
    expect(container.querySelector('.rounded-full.bg-signal')).toBeNull()
  })
})

describe('ConnectionDot', () => {
  it('shows nothing while connected, and says so a few seconds after it drops', () => {
    vi.useFakeTimers()
    const { rerender } = render(<ConnectionDot connection="live" />)
    expect(screen.getByRole('status').textContent).toBe('')
    rerender(<ConnectionDot connection="offline" />)
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('status').textContent).toBe('')
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.getByRole('status').textContent).toBe('Reconnecting')
    // A retry in progress keeps saying so; back live, it's gone at once.
    rerender(<ConnectionDot connection="connecting" />)
    expect(screen.getByRole('status').textContent).toBe('Reconnecting')
    rerender(<ConnectionDot connection="live" />)
    expect(screen.getByRole('status').textContent).toBe('')
  })
})
