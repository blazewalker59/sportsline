// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { Sheet } from '@/components/chat/Sheet'

const EXIT_MS = 220

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Sheet
          title="Play"
          onClose={() => {
            onClose?.()
            setOpen(false)
          }}
        >
          <a href="/x">Link</a>
          <button type="button">Last</button>
        </Sheet>
      )}
    </>
  )
}

const tab = (shiftKey = false) =>
  fireEvent.keyDown(window, { key: 'Tab', shiftKey })

describe('Sheet', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('focuses Done, traps Tab inside, and returns focus on close', () => {
    const { getByText } = render(<Harness />)
    const opener = getByText('Open')
    opener.focus()
    fireEvent.click(opener)

    const done = getByText('Done')
    expect(document.activeElement).toBe(done)

    const last = getByText('Last')
    last.focus()
    tab()
    // Wraps to the first focusable in the sheet: the backdrop's close button.
    const first = document.querySelector<HTMLElement>('[role="dialog"] button')!
    expect(document.activeElement).toBe(first)
    tab(true)
    expect(document.activeElement).toBe(last)

    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => vi.advanceTimersByTime(EXIT_MS))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('makes the page behind inert while open, and restores it', () => {
    const { getByText, container } = render(<Harness />)
    fireEvent.click(getByText('Open'))
    expect(container.hasAttribute('inert')).toBe(true)
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.closest('[inert]')).toBeNull()

    fireEvent.click(getByText('Done'))
    act(() => vi.advanceTimersByTime(EXIT_MS))
    expect(container.hasAttribute('inert')).toBe(false)
  })

  it('Escape closes only the top sheet', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    function Nested() {
      const [innerOpen, setInnerOpen] = useState(false)
      return (
        <Sheet title="Outer" onClose={outer}>
          <button type="button" onClick={() => setInnerOpen(true)}>
            More
          </button>
          {innerOpen && (
            <Sheet title="Inner" onClose={inner}>
              <p>Inner</p>
            </Sheet>
          )}
        </Sheet>
      )
    }
    const { getByText } = render(<Nested />)
    fireEvent.click(getByText('More'))
    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => vi.advanceTimersByTime(EXIT_MS))
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('never calls onClose after unmounting mid-exit', () => {
    const onClose = vi.fn()
    const { getByText, unmount } = render(
      <Sheet title="Play" onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    )
    fireEvent.click(getByText('Done'))
    unmount()
    act(() => vi.advanceTimersByTime(EXIT_MS * 2))
    expect(onClose).not.toHaveBeenCalled()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('Sheet with a Subject', () => {
  afterEach(cleanup)

  const lions = {
    wash: { light: '#0076b6', dark: '#0076b6' },
    ink: { light: '#0076b6', dark: '#b0b7bc' },
  }
  const chiefs = {
    wash: { light: '#e31837', dark: '#e31837' },
    ink: { light: '#e31837', dark: '#ffb612' },
  }
  const panel = () =>
    document.querySelector<HTMLElement>('[role="dialog"] > div')!
  const body = () =>
    document.querySelector<HTMLElement>('[role="dialog"] .overflow-y-auto')!

  it('stays neutral without one', () => {
    render(
      <Sheet title="Alerts" onClose={() => {}}>
        <p>Body</p>
      </Sheet>,
    )
    expect(panel().className).not.toContain('subject')
    expect(panel().style.getPropertyValue('--s-light')).toBe('')
    expect(body().className).not.toContain('subject-cards')
  })

  it('wears one team: a crown, its colors, tinted cards', () => {
    render(
      <Sheet title="Player" subject={lions} onClose={() => {}}>
        <p>Body</p>
      </Sheet>,
    )
    expect(panel().className).toContain('subject subject-crown')
    expect(panel().className).not.toContain('subject-crown--split')
    expect(panel().style.getPropertyValue('--s-light')).toBe('#0076b6')
    expect(panel().style.getPropertyValue('--s-ink-dark')).toBe('#b0b7bc')
    // One team: the second side is the same team.
    expect(panel().style.getPropertyValue('--s2-light')).toBe('#0076b6')
    expect(body().className).toContain('subject-cards')
  })

  it('splits the crown for two teams', () => {
    render(
      <Sheet
        title="Box score"
        subject={{ a: lions, b: chiefs }}
        onClose={() => {}}
      >
        <p>Body</p>
      </Sheet>,
    )
    expect(panel().className).toContain('subject-crown--split')
    expect(panel().style.getPropertyValue('--s-light')).toBe('#0076b6')
    expect(panel().style.getPropertyValue('--s2-light')).toBe('#e31837')
    expect(panel().style.getPropertyValue('--s2-ink-dark')).toBe('#ffb612')
    // Shared cards stay neutral: a card about one side opts in.
    expect(body().className).not.toContain('subject-cards')
  })
})
