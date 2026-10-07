import { afterEach, describe, expect, it, vi } from 'vitest'
import { isStaleBuild, reloadForNewBuild } from '@/lib/ops/staleBuild'

describe('isStaleBuild', () => {
  it("knows each browser's failed lazy import", () => {
    expect(
      isStaleBuild(new TypeError('Importing a module script failed.')),
    ).toBe(true)
    expect(
      isStaleBuild(
        new TypeError(
          'Failed to fetch dynamically imported module: /assets/x.js',
        ),
      ),
    ).toBe(true)
    expect(
      isStaleBuild('TypeError: error loading dynamically imported module'),
    ).toBe(true)
    expect(isStaleBuild(new Error('NHL 429'))).toBe(false)
  })
})

describe('reloadForNewBuild', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reloads once, then not again within a minute', () => {
    const store = new Map<string, string>()
    const reload = vi.fn()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    })
    vi.stubGlobal('window', { location: { reload } })
    const t = Date.parse('2026-10-06T23:00:00Z')
    expect(reloadForNewBuild(t)).toBe(true)
    expect(reloadForNewBuild(t + 30_000)).toBe(false)
    expect(reloadForNewBuild(t + 61_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it("doesn't reload when storage is unavailable", () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(reloadForNewBuild()).toBe(false)
  })
})
