// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { signIn } from '@/lib/auth/client'
import { Landing } from '@/components/landing/Landing'

// The sign-in client makes no request until it's called; here it's a spy.
vi.mock('@/lib/auth/client', () => ({ signIn: { social: vi.fn() } }))

afterEach(() => {
  cleanup()
  vi.mocked(signIn.social).mockClear()
})

describe('Landing', () => {
  it('says what Sportsline is, closing on live', () => {
    render(<Landing />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Every play that matters to you, live.',
    )
  })

  it('signs in with Google from every sign-in key', () => {
    render(<Landing />)
    const keys = [
      screen.getByRole('button', { name: 'Sign in' }),
      ...screen.getAllByRole('button', { name: 'Continue with Google' }),
    ]
    expect(keys).toHaveLength(3)
    for (const key of keys) fireEvent.click(key)
    expect(signIn.social).toHaveBeenCalledTimes(3)
    expect(signIn.social).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: '/',
    })
  })

  it('draws the product for the eye only: hidden and inert', () => {
    const { container } = render(<Landing />)
    const demo = Array.from(container.querySelectorAll('section')).find((s) =>
      s.textContent.includes('Nix to Waddle'),
    )!
    expect(demo.getAttribute('aria-hidden')).toBe('true')
    expect(demo.hasAttribute('inert')).toBe(true)
    // Its tiles are the board's own buttons, unreachable inside it.
    expect(demo.querySelectorAll('button').length).toBeGreaterThan(0)
  })

  it('heads its sections for a screen reader', () => {
    render(<Landing />)
    expect(
      screen.getByRole('region', { name: 'Four ways to watch' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('region', { name: 'Set up in a minute' }),
    ).toBeTruthy()
  })
})
