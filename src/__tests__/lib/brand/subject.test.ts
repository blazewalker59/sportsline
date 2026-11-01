import { describe, expect, it } from 'vitest'
import {
  MANAGER_HUES,
  colorSide,
  isPair,
  managerColor,
  matchupColors,
  matchupSubject,
  pairSubject,
  subjectStyle,
  teamNameStyle,
  teamSubject,
  washColor,
} from '@/lib/brand/subject'

const LIONS = { primary: '#0076b6', secondary: '#b0b7bc' }
const RAIDERS = { primary: '#000000', secondary: '#a5acaf' }
const PACKERS = { primary: '#203731', secondary: '#ffb612' }

describe('washColor', () => {
  it('keeps a primary that shows on the page', () => {
    expect(washColor(LIONS, 'light')).toBe('#0076b6')
    expect(washColor(LIONS, 'dark')).toBe('#0076b6')
  })

  it('washes in the secondary where the primary would vanish (dark)', () => {
    expect(washColor(RAIDERS, 'dark')).toBe('#a5acaf')
    expect(washColor(PACKERS, 'dark')).toBe('#ffb612')
    // On light, both still show.
    expect(washColor(RAIDERS, 'light')).toBe('#000000')
    expect(washColor(PACKERS, 'light')).toBe('#203731')
  })

  it('washes in the secondary where a pale primary would vanish (light)', () => {
    expect(
      washColor({ primary: '#f4f4f4', secondary: '#13274f' }, 'light'),
    ).toBe('#13274f')
  })

  it('keeps the primary when the secondary is no color', () => {
    expect(washColor({ primary: '#000000', secondary: '' }, 'dark')).toBe(
      '#000000',
    )
  })
})

describe('teamSubject', () => {
  it('washes and inks a team for each theme', () => {
    expect(teamSubject(RAIDERS)).toEqual({
      wash: { light: '#000000', dark: '#a5acaf' },
      // Names: the primary on light, the brighter color on dark.
      ink: { light: '#000000', dark: '#a5acaf' },
    })
  })

  it('is none without colors, or with a malformed one', () => {
    expect(teamSubject(null)).toBeNull()
    expect(teamSubject(undefined)).toBeNull()
    expect(teamSubject({ primary: 'red', secondary: '#ffffff' })).toBeNull()
  })
})

describe('pairSubject', () => {
  const a = teamSubject(LIONS)
  const b = teamSubject(PACKERS)

  it('pairs two teams with colors', () => {
    const pair = pairSubject(a, b)
    expect(pair && isPair(pair)).toBe(true)
  })

  it('is none when either team has no colors', () => {
    expect(pairSubject(a, null)).toBeNull()
    expect(pairSubject(null, b)).toBeNull()
  })
})

describe('managerColor', () => {
  it('gives the Viewer the accent', () => {
    expect(managerColor(3, true)).toBe('var(--accent)')
  })

  it('gives every other manager a steady hue from their team id', () => {
    expect(managerColor(1, false)).toBe('var(--manager-2)')
    expect(managerColor(1 + MANAGER_HUES, false)).toBe('var(--manager-2)')
    expect(managerColor(0, false)).toBe('var(--manager-1)')
    expect(managerColor(-1, false)).toBe(`var(--manager-${MANAGER_HUES})`)
  })
})

describe('matchupColors', () => {
  it('sets the Viewer against their opponent’s hue', () => {
    expect(matchupColors(3, 4, true)).toEqual({
      left: 'var(--accent)',
      right: 'var(--manager-5)',
    })
  })

  it('never gives both sides one hue', () => {
    const c = matchupColors(2, 2 + MANAGER_HUES, false)
    expect(c.left).toBe('var(--manager-3)')
    expect(c.right).toBe('var(--manager-4)')
  })

  it('has no right side on a bye', () => {
    expect(matchupColors(3, null, true)).toEqual({
      left: 'var(--accent)',
      right: null,
    })
    expect(matchupSubject({ left: 'var(--accent)', right: null })).toEqual(
      colorSide('var(--accent)'),
    )
  })
})

describe('subjectStyle', () => {
  it('sets nothing without a Subject', () => {
    expect(subjectStyle(null)).toEqual({})
  })

  it('sets both sides, the second repeating a lone team', () => {
    const s = subjectStyle(teamSubject(LIONS))
    expect(s).toMatchObject({
      '--s-light': '#0076b6',
      '--s-ink-dark': '#b0b7bc',
      '--s2-light': '#0076b6',
    })
  })

  it('sets each team of a pair on its own side', () => {
    const s = subjectStyle(matchupSubject(matchupColors(1, 2, true))) as Record<
      string,
      string
    >
    expect(s['--s-light']).toBe('var(--accent)')
    expect(s['--s2-dark']).toBe('var(--manager-3)')
  })
})

describe('teamNameStyle', () => {
  it('sets a name’s ink per theme', () => {
    expect(teamNameStyle(PACKERS)).toEqual({
      '--name-light': '#203731',
      '--name-dark': '#ffb612',
    })
  })

  it('is nothing without colors', () => {
    expect(teamNameStyle(null)).toBeUndefined()
  })
})
