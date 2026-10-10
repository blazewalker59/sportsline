/** Sharp picks as the app shows them: Kalshi links, the banner. Pure. */

/**
 * The Kalshi page for a market's Game, as Kalshi's app shares it
 * (`/markets/kxncaafgame/indiana-vs-nebraska/KXNCAAFGAME-26OCT10INDNEB`):
 * the Game's winner event, which opens on Kalshi's usual game view with its
 * spreads and totals beside it, even for a spread or total pick. The slug
 * comes from Kalshi's title for the Game ("Indiana vs Nebraska"); picks
 * stored before titles were read get a placeholder, which still resolves.
 */
export function kalshiEventUrl(
  marketTicker: string,
  gameTitle?: string | null,
): string {
  const [series, date] = marketTicker.toUpperCase().split('-')
  const game = series.replace(/(SPREAD|TOTAL)$/, 'GAME')
  const event = date ? `${game}-${date}` : game
  const slug = (gameTitle && kalshiSlug(gameTitle)) || 'game'
  return `https://kalshi.com/markets/${game.toLowerCase()}/${slug}/${event}`
}

/** "Morehead St. vs Dayton" → "morehead-st-vs-dayton". */
export function kalshiSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
}

export interface SlateSummary {
  singles: number
  strong: number
  hasCombo: boolean
  /** The single with the most edge, to lead the banner with. */
  best: { title: string; edge: number } | null
}

export function slateSummary(
  picks: ReadonlyArray<{
    kind: 'single' | 'combo'
    grade: 'strong' | 'edge' | 'thin'
    title: string
    edge: number
  }>,
): SlateSummary {
  const singles = picks.filter((p) => p.kind === 'single')
  const best = singles.reduce<SlateSummary['best']>(
    (b, p) => (!b || p.edge > b.edge ? { title: p.title, edge: p.edge } : b),
    null,
  )
  return {
    singles: singles.length,
    strong: singles.filter((p) => p.grade === 'strong').length,
    hasCombo: picks.some((p) => p.kind === 'combo'),
    best,
  }
}

/** The banner shows for a slate until it's dismissed for that day. */
export function bannerVisible(
  slateDay: string | null,
  dismissedDay: string | null,
): boolean {
  return slateDay !== null && slateDay !== dismissedDay
}
