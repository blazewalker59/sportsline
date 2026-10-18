/** The /mcp per-token limit's fixed window. */

import { describe, expect, it } from 'vitest'
import type { RateWindow } from '@/lib/agents/rateLimit'
import { hit } from '@/lib/agents/rateLimit'

describe('hit', () => {
  it('allows the limit in a window, then says how long to wait', () => {
    const windows = new Map<string, RateWindow>()
    const at = 1_000_000
    for (let i = 0; i < 3; i++) expect(hit(windows, 't', at, 3)).toBe(0)
    expect(hit(windows, 't', at + 15_500, 3)).toBe(45)
    // Other tokens count apart.
    expect(hit(windows, 'u', at + 15_500, 3)).toBe(0)
    // A new window starts a minute after the first request.
    expect(hit(windows, 't', at + 59_999, 3)).toBe(1)
    expect(hit(windows, 't', at + 60_000, 3)).toBe(0)
  })
})
