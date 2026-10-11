/**
 * MLB polls go through the shared retrying JSON reader, same as the other
 * adapters: one 429 must not drop the snapshot.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mlbAdapter } from '@/lib/sources/mlb'

describe('MLB fetches', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('retries a 429 before reading the schedule', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'retry-after': '0.001' } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(mlbAdapter.schedule('2026-10-11')).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('statsapi.mlb.com')
  })
})
