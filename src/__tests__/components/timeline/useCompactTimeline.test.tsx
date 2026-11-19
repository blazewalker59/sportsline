// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCompactTimeline } from '@/components/timeline/useCompactTimeline'

function Probe() {
  const compact = useCompactTimeline()
  return <p>{compact === null ? 'unknown' : compact ? 'phone' : 'rail'}</p>
}

/** The window is at least `md` wide, or not. */
function setRail(rail: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query === '(min-width: 48rem)' ? rail : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useCompactTimeline', () => {
  it('is a phone’s Timeline below `md`', () => {
    setRail(false)
    render(<Probe />)
    expect(screen.getByText('phone')).toBeTruthy()
  })

  it('isn’t from `md`, where the rail is', () => {
    setRail(true)
    render(<Probe />)
    expect(screen.getByText('rail')).toBeTruthy()
  })

  it('doesn’t know on the server', () => {
    expect(renderToString(<Probe />)).toContain('unknown')
  })
})
