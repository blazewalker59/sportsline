// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeedFooter } from '@/components/timeline/TimelineFeed'

afterEach(cleanup)

const footer = (over: Partial<React.ComponentProps<typeof FeedFooter>>) => (
  <FeedFooter
    error={false}
    onRetry={() => {}}
    empty
    emptyText="No plays yet today."
    hasMore={false}
    loadingMore={false}
    onMore={() => {}}
    {...over}
  />
)

describe('FeedFooter', () => {
  it('shows bubbles, not the empty text, while the day loads', () => {
    render(footer({ loading: true }))
    expect(screen.getByRole('status', { name: 'Loading plays' })).toBeTruthy()
    expect(screen.queryByText('No plays yet today.')).toBeNull()
  })

  it('says the day is empty once it has loaded', () => {
    render(footer({ loading: false }))
    expect(screen.getByText('No plays yet today.')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows neither when there are plays', () => {
    render(footer({ empty: false, loading: true }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText('No plays yet today.')).toBeNull()
  })

  it('a failed load says so with Try again, instead of either', () => {
    const onRetry = vi.fn()
    render(footer({ error: true, loading: true, onRetry }))
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
