/** Sharp picks as the app shows them: Kalshi links, the banner. Pure. */

/**
 * The Kalshi page for a market's event, in the form Kalshi itself links
 * (`/markets/{series}/{slug}/{event}`), which its app opens from a link;
 * a bare series page doesn't. Kalshi resolves the event from the last
 * part, so the slug only needs to be present.
 */
export function kalshiEventUrl(marketTicker: string): string {
  const [series, date] = marketTicker.toLowerCase().split('-')
  const event = date ? `${series}-${date}` : series
  return `https://kalshi.com/markets/${series}/game/${event}`
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
