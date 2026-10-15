import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KeyPlayPanel } from '@/components/charts/KeyPlays'

const panel = (count: number, index: number) =>
  renderToStaticMarkup(
    <KeyPlayPanel
      count={count}
      index={index}
      onStep={() => {}}
      onClose={() => {}}
    >
      <p>Goal · COL</p>
    </KeyPlayPanel>,
  )

const disabled = (html: string, label: string) =>
  new RegExp(`aria-label="${label}" disabled=""`).test(html)

describe('KeyPlayPanel', () => {
  it('shows nothing without plays', () => {
    expect(panel(0, -1)).toBe('')
  })

  it('invites a tap until a play is picked, with both steps open', () => {
    const html = panel(10, -1)
    expect(html).toContain('Tap the chart for a scoring play · 10 marked')
    expect(html).not.toContain('Goal · COL')
    expect(html).not.toContain('aria-label="Close"')
    expect(disabled(html, 'Previous scoring play')).toBe(false)
    expect(disabled(html, 'Next scoring play')).toBe(false)
  })

  it('tells the picked play, where it falls, and stops at the ends', () => {
    const middle = panel(10, 4)
    expect(middle).toContain('5 of 10')
    expect(middle).toContain('Goal · COL')
    expect(middle).toContain('aria-label="Close"')

    expect(disabled(panel(10, 0), 'Previous scoring play')).toBe(true)
    expect(disabled(panel(10, 9), 'Next scoring play')).toBe(true)
    expect(disabled(panel(10, 9), 'Previous scoring play')).toBe(false)
  })
})
