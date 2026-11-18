import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The Landing's sign-in button carries the Better Auth client, which has no
// place in a render test (and makes no request until it's clicked).
vi.mock('@/lib/auth/client', () => ({ signIn: { social: vi.fn() } }))

const FALLBACK = 'min-h-dvh bg-background'

describe('LazyLanding', () => {
  it('hands the loaded Landing to lazy without waiting', async () => {
    const { landingModule, loadLanding } =
      await import('@/components/landing/LazyLanding')
    const { Landing } = await loadLanding()

    let resolved: unknown
    void landingModule().then((m) => {
      resolved = m.default
    })
    // Synchronously, not on a later microtask.
    expect(resolved).toBe(Landing)
  })

  it('renders the Landing in full, not its fallback, once loaded', async () => {
    const { Landing, loadLanding } =
      await import('@/components/landing/LazyLanding')
    await loadLanding()

    const html = renderToString(<Landing />)
    expect(html).toContain('Mahomes')
    expect(html).not.toContain(FALLBACK)
    // A complete Suspense boundary, not a pending (`$?`) or client (`$!`) one.
    expect(html).toContain('<!--$-->')
    expect(html).not.toMatch(/<!--\$[?!]-->/)
  })

  it('loads the module once', async () => {
    const { loadLanding } = await import('@/components/landing/LazyLanding')
    expect(loadLanding()).toBe(loadLanding())
  })
})
