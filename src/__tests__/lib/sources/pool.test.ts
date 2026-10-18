import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BROWSER_USER_AGENT,
  LIVE_POLL,
  fetchWithRetry,
  getJson,
  mapPool,
} from '@/lib/sources/pool'

describe('mapPool', () => {
  it('keeps order and never exceeds the limit', async () => {
    let inFlight = 0
    let peak = 0
    const out = await mapPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5 * (8 - n)))
      inFlight--
      return n * 10
    })
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70])
    expect(peak).toBe(3)
  })
})

describe('fetchWithRetry', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('retries a 429, honoring Retry-After, then returns the success', async () => {
    const responses = [
      new Response('', { status: 429, headers: { 'retry-after': '2' } }),
      new Response('ok', { status: 200 }),
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(responses.shift()!)),
    )
    const waits: Array<number> = []
    const res = await fetchWithRetry('https://x', undefined, (ms) => {
      waits.push(ms)
      return Promise.resolve()
    })
    expect(res.status).toBe(200)
    expect(waits).toEqual([2000])
  })

  it('gives up after a few attempts and does not retry a 404', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response('', { status: 429 })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const res = await fetchWithRetry('https://x', undefined, () =>
      Promise.resolve(),
    )
    expect(res.status).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(4)

    const notFound = vi.fn(() =>
      Promise.resolve(new Response('', { status: 404 })),
    )
    vi.stubGlobal('fetch', notFound)
    expect((await fetchWithRetry('https://x')).status).toBe(404)
    expect(notFound).toHaveBeenCalledTimes(1)
  })
})

describe('getJson', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('retries a 429, then parses the JSON', async () => {
    const responses = [
      new Response('', { status: 429, headers: { 'retry-after': '0.001' } }),
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ]
    const fetchMock = vi.fn(() => Promise.resolve(responses.shift()!))
    vi.stubGlobal('fetch', fetchMock)
    const read = getJson('NHL')
    await expect(read<{ ok: boolean }>('https://x')).resolves.toEqual({
      ok: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends a browser User-Agent, which ESPN requires', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response('{}', { status: 200 })),
    )
    vi.stubGlobal('fetch', fetchMock)
    await getJson('ESPN')('https://site.api.espn.com/x')
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get('user-agent')).toBe(BROWSER_USER_AGENT)
    expect(headers.get('user-agent')).toMatch(/^Mozilla\/5\.0 /)
  })

  it('names the source when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
    )
    const read = getJson('MLB StatsAPI')
    await expect(read('https://statsapi.mlb.com/api/x')).rejects.toThrow(
      'MLB StatsAPI 404 for https://statsapi.mlb.com/api/x',
    )
  })
})

describe('timeouts and live polls', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('abandons a call that does not answer in time, naming the source', async () => {
    // A Source that never answers, until the request is aborted.
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      getJson('NHL', { timeoutMs: 10 })('https://api-web.nhle.com/x'),
    ).rejects.toThrow('NHL timed out after 10ms for https://api-web.nhle.com/x')
    // Retrying is about 429s and 5xxs; a timeout fails the call.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives every call a deadline by default', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response('{}', { status: 200 })),
    )
    vi.stubGlobal('fetch', fetchMock)
    await getJson('ESPN')('https://x')
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('makes a live poll a single attempt, leaving backoff to its pacing', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response('', { status: 429 })),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(getJson('NHL', LIVE_POLL)('https://x')).rejects.toThrow(
      'NHL 429 for https://x',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
