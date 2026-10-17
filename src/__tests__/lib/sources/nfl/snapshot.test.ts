import { afterEach, describe, expect, it, vi } from 'vitest'
import summaryFixture from '../../../fixtures/nfl/live-401872964.json'
import playsFixture from '../../../fixtures/nfl/live-401872964-plays.json'
import { nflAdapter } from '@/lib/sources/nfl'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

function espn(coreStatus: number) {
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve(
      url.includes('/summary?')
        ? json(summaryFixture)
        : coreStatus === 200
          ? json(playsFixture)
          : json({}, coreStatus),
    ),
  )
}

describe('NFL snapshot', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reads Plays and who was involved from the core API', async () => {
    espn(200)
    const game = await nflAdapter.snapshot('401872964')
    expect(game.fallback).toBeUndefined()
    expect(
      game.items.some((i) => i.kind === 'play' && i.involved.length > 0),
    ).toBe(true)
  })

  it('falls back on the summary when the core API refuses, and says so', async () => {
    espn(403)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = await nflAdapter.snapshot('401872964')
    expect(game.fallback).toMatch(/ESPN core plays unavailable: ESPN 403/)
    const plays = game.items.filter((i) => i.kind === 'play')
    expect(plays.length).toBeGreaterThan(100)
    // Only the latest play names its players in the summary.
    expect(plays.filter((p) => p.involved.length > 0)).toHaveLength(1)
  })
})
