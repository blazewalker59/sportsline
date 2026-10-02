import { describe, expect, it } from 'vitest'
import { canonicalRedirect } from '@/lib/canonical'

describe('canonicalRedirect', () => {
  it('sends www and workers.dev to the same path on the canonical host', () => {
    for (const host of [
      'www.sportsline.dev',
      'sportsline.blazewalker59.workers.dev',
    ]) {
      const r = canonicalRedirect(
        new URL(`https://${host}/?day=2026-09-27&scope=nfl`),
        'GET',
        'sportsline.dev',
      )!
      expect(r.status).toBe(301)
      expect(r.headers.get('location')).toBe(
        'https://sportsline.dev/?day=2026-09-27&scope=nfl',
      )
    }
  })

  it('keeps the method for non-GET requests', () => {
    expect(
      canonicalRedirect(
        new URL('https://www.sportsline.dev/api/auth/x'),
        'POST',
        'sportsline.dev',
      )!.status,
    ).toBe(308)
  })

  it('leaves the canonical host and unconfigured (local) hosts alone', () => {
    expect(
      canonicalRedirect(
        new URL('https://sportsline.dev/'),
        'GET',
        'sportsline.dev',
      ),
    ).toBeNull()
    expect(
      canonicalRedirect(new URL('http://localhost:3000/'), 'GET', undefined),
    ).toBeNull()
  })
})
