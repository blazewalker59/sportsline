import { describe, expect, it } from 'vitest'
import { swipeDirection } from '@/components/layout/useSwipe'

describe('swipeDirection', () => {
  it('reads a quick sideways flick as a swipe, by the way the finger went', () => {
    expect(swipeDirection(-120, 10, 250)).toBe('left')
    expect(swipeDirection(90, -20, 300)).toBe('right')
  })

  it('leaves scrolls, taps and slow drags alone', () => {
    // Scrolling the Timeline: mostly up or down.
    expect(swipeDirection(-80, 60, 250)).toBeNull()
    // A tap, or a nudge.
    expect(swipeDirection(-30, 0, 120)).toBeNull()
    // Dragging slowly, as when reading along a line.
    expect(swipeDirection(-150, 0, 1200)).toBeNull()
  })
})
