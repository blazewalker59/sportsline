// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useStoredValue } from '@/lib/useStoredValue'

const KEY = 'sportsline:test'

let setFromA: (v: string | null) => void = () => {}

function A() {
  const [value, set] = useStoredValue(KEY)
  setFromA = set
  return <span data-testid="a">{value ?? 'none'}</span>
}

function B() {
  const [value] = useStoredValue(KEY)
  return <span data-testid="b">{value ?? 'none'}</span>
}

describe('useStoredValue', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('reads what is stored', () => {
    localStorage.setItem(KEY, 'stored')
    const { getByTestId } = render(<B />)
    expect(getByTestId('b').textContent).toBe('stored')
  })

  it('updates every reader in the same tab on a write', () => {
    const { getByTestId } = render(
      <>
        <A />
        <B />
      </>,
    )
    expect(getByTestId('b').textContent).toBe('none')
    act(() => setFromA('2026-10-18'))
    expect(localStorage.getItem(KEY)).toBe('2026-10-18')
    expect(getByTestId('a').textContent).toBe('2026-10-18')
    expect(getByTestId('b').textContent).toBe('2026-10-18')
    act(() => setFromA(null))
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(getByTestId('b').textContent).toBe('none')
  })

  it('follows a write from another tab', () => {
    const { getByTestId } = render(<B />)
    act(() => {
      localStorage.setItem(KEY, 'elsewhere')
      window.dispatchEvent(new Event('storage'))
    })
    expect(getByTestId('b').textContent).toBe('elsewhere')
  })
})
