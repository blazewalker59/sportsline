/**
 * Team logos come from each Source as marks for dark backgrounds; each
 * Source also has a light-background mark at a predictable address. Pure.
 */

/** The light-background mark for a dark-background logo URL, if known. */
export function lightLogo(url: string | null | undefined): string | null {
  if (!url) return null
  // Plain substrings, so a proxied (URL-encoded) address works too.
  const swaps: Array<[string, string]> = [
    ['500-dark', '500'], // ESPN
    ['team-cap-on-dark', 'team-cap-on-light'], // MLB
    ['_dark.svg', '_light.svg'], // NHL
  ]
  for (const [dark, light] of swaps) {
    if (url.includes(dark)) return url.replace(dark, light)
  }
  return null
}
