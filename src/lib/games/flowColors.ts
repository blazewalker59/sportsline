/**
 * Line colors for two teams on one chart: each team's primary when it
 * stands out on the page in that theme, else its secondary (else a
 * neutral), and never two colors too alike to tell apart. Pure.
 */

import type { TeamRef } from '@/lib/model/timeline'
import { contrast } from '@/lib/timeline/chat'

/** The page backgrounds (styles.css --background). */
const PAGE = { light: '#f3f4f8', dark: '#0e1015' } as const
const NEUTRAL = { light: '#5d6170', dark: '#c4c8d4' } as const
/** Under this against the page, a thin line all but disappears. */
const MIN_ON_PAGE = 2.2
/** Under this perceptual distance, the two teams' lines read as one. */
const MIN_APART = 180

type Theme = keyof typeof PAGE

export interface ThemeColors {
  light: string
  dark: string
}

/**
 * How different two colors look (redmean RGB distance, 0–~765): hue
 * counts, not just brightness (a red and a green of equal brightness are
 * far apart; two navies are close).
 */
export function colorDistance(a: string, b: string): number {
  const rgb = (c: string) =>
    [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const mean = (r1 + r2) / 2
  return Math.sqrt(
    (2 + mean / 256) * (r1 - r2) ** 2 +
      4 * (g1 - g2) ** 2 +
      (2 + (255 - mean) / 256) * (b1 - b2) ** 2,
  )
}

const isHex = (c: string | undefined): c is string =>
  Boolean(c && /^#[0-9a-f]{6}$/i.test(c))

function candidates(team: TeamRef): Array<string> {
  return [team.colors?.primary, team.colors?.secondary].filter(isHex)
}

function pick(
  options: ReadonlyArray<string>,
  theme: Theme,
  avoid?: string,
): string {
  const visible = options.filter((c) => contrast(c, PAGE[theme]) >= MIN_ON_PAGE)
  const distinct = avoid
    ? visible.filter((c) => colorDistance(c, avoid) >= MIN_APART)
    : visible
  // Nothing distinct from the other team: a neutral, not a near-twin.
  return distinct[0] ?? (avoid ? NEUTRAL[theme] : visible[0]) ?? NEUTRAL[theme]
}

/** Colors for the away and home lines, in each theme. */
export function flowColors(
  away: TeamRef,
  home: TeamRef,
): { away: ThemeColors; home: ThemeColors } {
  const a = candidates(away)
  const h = candidates(home)
  const awayLight = pick(a, 'light')
  const awayDark = pick(a, 'dark')
  return {
    away: { light: awayLight, dark: awayDark },
    home: {
      light: pick(h, 'light', awayLight),
      dark: pick(h, 'dark', awayDark),
    },
  }
}
