// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { Picker } from '@/components/fantasy/Picker'

const OPTIONS = [
  { key: 'All', label: 'All positions' },
  { key: 'QB', label: 'QB' },
  { key: 'RB', label: 'RB' },
] as const

function Harness() {
  const [value, setValue] = useState<(typeof OPTIONS)[number]['key']>('All')
  return (
    <>
      <Picker
        label="Position"
        options={OPTIONS}
        value={value}
        onChange={setValue}
      />
      <p>Outside</p>
    </>
  )
}

afterEach(cleanup)

describe('Picker', () => {
  it('shows the choice, and opens to every option, the chosen checked', () => {
    const { getByRole, queryByRole, getAllByRole } = render(<Harness />)
    const button = getByRole('button', { name: 'Position: All positions' })
    expect(queryByRole('listbox')).toBeNull()
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const options = getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'All positions',
      'QB',
      'RB',
    ])
    expect(options[0].getAttribute('aria-selected')).toBe('true')
  })

  it('picks a tapped option and closes', () => {
    const { getByRole, queryByRole } = render(<Harness />)
    fireEvent.click(getByRole('button', { name: 'Position: All positions' }))
    fireEvent.click(getByRole('option', { name: 'RB' }))
    expect(queryByRole('listbox')).toBeNull()
    expect(getByRole('button', { name: 'Position: RB' })).toBeTruthy()
  })

  it('moves with the arrow keys and picks with Enter', () => {
    const { getByRole } = render(<Harness />)
    const button = getByRole('button', { name: 'Position: All positions' })
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    const list = getByRole('listbox')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(list.getAttribute('aria-activedescendant')).toMatch(/-2$/)
    fireEvent.keyDown(list, { key: 'Home' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(getByRole('button', { name: 'Position: QB' })).toBeTruthy()
  })

  it('closes on Escape or a tap outside, choosing nothing', () => {
    const { getByRole, getByText, queryByRole } = render(<Harness />)
    const button = getByRole('button', { name: 'Position: All positions' })
    fireEvent.click(button)
    fireEvent.keyDown(getByRole('listbox'), { key: 'Escape' })
    expect(queryByRole('listbox')).toBeNull()
    fireEvent.click(button)
    fireEvent.pointerDown(getByText('Outside'))
    expect(queryByRole('listbox')).toBeNull()
    expect(
      getByRole('button', { name: 'Position: All positions' }),
    ).toBeTruthy()
  })
})
