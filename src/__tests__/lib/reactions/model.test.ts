import { describe, expect, it } from 'vitest'
import { isReaction, tally } from '@/lib/reactions/model'
import { proxiedLogo } from '@/lib/logoProxy'
import { withMine } from '@/lib/reactions/useReactions'

describe('tally', () => {
  it("counts each item's Reactions, most first, and marks yours", () => {
    const t = tally(
      [
        { itemId: 'a', viewerId: 'me', emoji: '🔥' },
        { itemId: 'a', viewerId: 'x', emoji: '😭' },
        { itemId: 'a', viewerId: 'y', emoji: '😭' },
        { itemId: 'b', viewerId: 'x', emoji: '🐐' },
        { itemId: 'b', viewerId: 'z', emoji: 'not-one' },
      ],
      'me',
    )
    expect(t.a).toEqual({
      counts: [
        { emoji: '😭', count: 2 },
        { emoji: '🔥', count: 1 },
      ],
      mine: '🔥',
    })
    expect(t.b).toEqual({ counts: [{ emoji: '🐐', count: 1 }], mine: null })
  })

  it('only knows its own emojis', () => {
    expect(isReaction('🔥')).toBe(true)
    expect(isReaction('🍕')).toBe(false)
  })
})

describe('withMine', () => {
  it('swaps your Reaction, dropping emptied counts', () => {
    const before = {
      counts: [
        { emoji: '🔥' as const, count: 1 },
        { emoji: '😭' as const, count: 2 },
      ],
      mine: '🔥' as const,
    }
    expect(withMine(before, '😭')).toEqual({
      counts: [{ emoji: '😭', count: 3 }],
      mine: '😭',
    })
    expect(withMine(before, null).mine).toBeNull()
    expect(withMine(undefined, '🐐')).toEqual({
      counts: [{ emoji: '🐐', count: 1 }],
      mine: '🐐',
    })
  })
})

describe('proxiedLogo', () => {
  it('routes only known logo hosts through /logo', () => {
    expect(
      proxiedLogo('https://assets.nhle.com/logos/nhl/svg/TOR_dark.svg'),
    ).toBe(
      '/logo?u=https%3A%2F%2Fassets.nhle.com%2Flogos%2Fnhl%2Fsvg%2FTOR_dark.svg',
    )
    expect(proxiedLogo('https://evil.example/x.png')).toBe(
      'https://evil.example/x.png',
    )
    expect(proxiedLogo(null)).toBeNull()
  })
})
