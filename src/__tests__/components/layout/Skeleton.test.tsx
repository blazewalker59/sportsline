// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CardSkeleton,
  DetailHeaderSkeleton,
  RowsSkeleton,
  Skeleton,
} from '@/components/layout/Skeleton'

afterEach(cleanup)

const blocks = (root: Element) =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-skeleton]'))

describe('Skeleton', () => {
  it('pulses only when motion is allowed', () => {
    const { container } = render(<Skeleton className="h-4 w-10" />)
    const block = blocks(container)[0]
    const classes = block.className.split(/\s+/)
    expect(classes).toContain('motion-safe:animate-pulse')
    // A bare animate-pulse would ignore prefers-reduced-motion.
    expect(classes).not.toContain('animate-pulse')
    expect(classes).toContain('h-4')
  })
})

describe.each([
  ['RowsSkeleton', () => <RowsSkeleton />],
  ['CardSkeleton', () => <CardSkeleton />],
  ['DetailHeaderSkeleton', () => <DetailHeaderSkeleton />],
])('%s', (_, make) => {
  it('is one labelled loading status, its blocks hidden from assistive tech', () => {
    render(make())
    const status = screen.getByRole('status', { name: 'Loading' })
    expect(status.getAttribute('aria-busy')).toBe('true')
    const hidden = status.querySelector('[aria-hidden="true"]')
    expect(hidden).not.toBeNull()
    expect(blocks(status).length).toBeGreaterThan(0)
    expect(blocks(status).every((b) => hidden!.contains(b))).toBe(true)
    for (const b of blocks(status))
      expect(b.className).toContain('motion-safe:animate-pulse')
  })
})

describe('RowsSkeleton', () => {
  it('draws as many rows as asked, five by default', () => {
    const { container, rerender } = render(<RowsSkeleton />)
    expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(5)
    rerender(<RowsSkeleton rows={3} label="Loading Reactions" />)
    expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(3)
    expect(
      screen.getByRole('status', { name: 'Loading Reactions' }),
    ).toBeTruthy()
  })
})
