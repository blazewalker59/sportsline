import { afterEach, describe, expect, it, vi } from 'vitest'
import pbpFixture from '../../../fixtures/nhl/pbp-2026020009.json'
import boxFixture from '../../../fixtures/nhl/box-2026020009.json'
import { nhlAdapter } from '@/lib/sources/nhl'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

function nhl(boxStatus: number) {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url.endsWith('/play-by-play')
        ? json(pbpFixture)
        : boxStatus === 200
          ? json(boxFixture)
          : json({}, boxStatus),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('NHL snapshot', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reads the full box score with the Plays', async () => {
    nhl(200)
    const game = await nhlAdapter.snapshot('2026020009')
    expect(game.fallback).toBeUndefined()
    expect(game.boxPartial).toBeUndefined()
    expect(game.box?.tables.length).toBeGreaterThan(0)
  })

  it('says so when the box score is only the Plays, and tries it once', async () => {
    const fetchMock = nhl(503)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = await nhlAdapter.snapshot('2026020009')
    expect(game.fallback).toMatch(/NHL boxscore unavailable: NHL 503/)
    expect(game.boxPartial).toBe(true)
    expect(game.items.length).toBeGreaterThan(0)
    // A live poll never retries inside itself; LiveGame paces the next.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
