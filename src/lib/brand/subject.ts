/**
 * A sheet's or page's Subject: the team (or two) it's about, as the colors
 * that carry the feed's team color into it (styles.css, "Subject"). A
 * wash for its crown, cards, bars and fills, and an ink for its labels and
 * names, each for both themes. Fantasy teams have no brand colors: the
 * Viewer's side is the app accent, every other manager one of eight hues.
 * Pure.
 */

import type { TeamColors } from './teamColors'
import { contrast, nameColors } from '@/lib/timeline/chat'

export interface ThemeColors {
  light: string
  dark: string
}

/** One side of a Subject: a CSS color for each theme, for each use. */
export interface SubjectSide {
  /** The crown, card tints, bars and fills. */
  wash: ThemeColors
  /** Labels and names (pulled toward the text color in styles.css). */
  ink: ThemeColors
}

/** One team, or two facing each other (away or the Viewer first). */
export type Subject = SubjectSide | { a: SubjectSide; b: SubjectSide }

/** The page backgrounds (styles.css --background). */
const PAGE = { light: '#f3f4f8', dark: '#0e1015' } as const
/**
 * Under this against the page, a primary would vanish as a wash (the
 * Raiders' black, the Packers' green in dark): its secondary washes
 * instead, as nameColors does for names.
 */
const MIN_WASH = { light: 1.3, dark: 1.6 } as const

const isHex = (c: string | undefined): c is string =>
  Boolean(c && /^#[0-9a-f]{6}$/i.test(c))

/** A wash that shows in a theme: the primary, else the secondary. */
export function washColor(
  colors: TeamColors,
  theme: keyof typeof PAGE,
): string {
  return contrast(colors.primary, PAGE[theme]) < MIN_WASH[theme] &&
    isHex(colors.secondary)
    ? colors.secondary
    : colors.primary
}

/** A real team's side, or null without (valid) colors. */
export function teamSubject(
  colors: TeamColors | null | undefined,
): SubjectSide | null {
  if (!colors || !isHex(colors.primary)) return null
  const ink = nameColors(colors)!
  return {
    wash: {
      light: washColor(colors, 'light'),
      dark: washColor(colors, 'dark'),
    },
    ink,
  }
}

/**
 * A Player's name in their team's ink, anywhere (the feed's .team-name
 * class reads these): undefined without colors.
 */
export function teamNameStyle(
  colors: TeamColors | null | undefined,
): React.CSSProperties | undefined {
  const tints = nameColors(colors)
  if (!tints) return undefined
  return {
    '--name-light': tints.light,
    '--name-dark': tints.dark,
  } as React.CSSProperties
}

/** How many manager hues there are (styles.css --manager-1…8). */
export const MANAGER_HUES = 8

/**
 * A Fantasy team's color: the accent for the Viewer's, else one of the
 * manager hues picked from its team id, so a manager keeps theirs.
 */
export function managerColor(teamId: number, mine: boolean): string {
  if (mine) return 'var(--accent)'
  const n =
    (((Math.trunc(teamId) % MANAGER_HUES) + MANAGER_HUES) % MANAGER_HUES) + 1
  return `var(--manager-${n})`
}

/** A side in one CSS color (a token already tuned per theme). */
export function colorSide(color: string): SubjectSide {
  return {
    wash: { light: color, dark: color },
    ink: { light: color, dark: color },
  }
}

/**
 * A Fantasy Matchup's two colors, left (the Viewer's, when it's theirs)
 * and right (null on a bye): never the same hue for both.
 */
export function matchupColors(
  left: number,
  right: number | null,
  leftMine: boolean,
): { left: string; right: string | null } {
  const l = managerColor(left, leftMine)
  if (right === null) return { left: l, right: null }
  const r = managerColor(right, false)
  return { left: l, right: r === l ? managerColor(right + 1, false) : r }
}

/** A Fantasy Matchup's Subject: both managers' colors, or one on a bye. */
export function matchupSubject(colors: {
  left: string
  right: string | null
}): Subject {
  return colors.right === null
    ? colorSide(colors.left)
    : { a: colorSide(colors.left), b: colorSide(colors.right) }
}

/**
 * Two sides facing each other, or none unless both have colors: one
 * side's color would otherwise stand in for the other's.
 */
export function pairSubject(
  a: SubjectSide | null,
  b: SubjectSide | null,
): Subject | null {
  return a && b ? { a, b } : null
}

export const isPair = (s: Subject): s is { a: SubjectSide; b: SubjectSide } =>
  'a' in s

/**
 * The CSS variables that put a Subject on an element (with the `subject`
 * class): styles.css resolves them for the theme.
 */
export function subjectStyle(subject: Subject | null): React.CSSProperties {
  if (!subject) return {}
  const [a, b] = isPair(subject) ? [subject.a, subject.b] : [subject, subject]
  return {
    '--s-light': a.wash.light,
    '--s-dark': a.wash.dark,
    '--s-ink-light': a.ink.light,
    '--s-ink-dark': a.ink.dark,
    '--s2-light': b.wash.light,
    '--s2-dark': b.wash.dark,
    '--s2-ink-light': b.ink.light,
    '--s2-ink-dark': b.ink.dark,
  } as React.CSSProperties
}
