/**
 * The frame every chart sits in (src/components/charts): a surface card,
 * a small caption row with a legend on the left and a headline figure on
 * the right, then the chart. Charts are TanStack Charts (@tanstack/charts)
 * rendered as SVG through `Chart` from '@tanstack/charts/react'.
 *
 * Conventions, so the app's charts read as one family:
 * - Colors come from the theme tokens in CHART_COLORS (CSS variables), so
 *   light and dark mode follow automatically; tooltips are themed in
 *   styles.css (.ts-chart-tooltip).
 * - The card sets `color: var(--muted)`, which the library uses for axes,
 *   ticks and grid lines (it paints them in currentColor).
 * - Money, percent and dates use ./format.
 * - Memoize each chart definition (useMemo) on the data it captures.
 * - Give every Chart an `ariaLabel` that states the takeaway, and a fixed
 *   `height` with `initialWidth` (SSR and first paint before measuring).
 */

import { cn } from '@/lib/utils'

/** Theme colors for marks: CSS variables, so they follow light and dark. */
export const CHART_COLORS = {
  accent: 'var(--color-accent)',
  good: 'var(--color-scoring)',
  bad: 'var(--color-live)',
  muted: 'var(--color-muted)',
  foreground: 'var(--color-foreground)',
  /** The Viewer's side in a head-to-head (theirs is `opponent`). */
  mine: 'var(--color-accent)',
  opponent: 'var(--color-live)',
} as const

export interface LegendItem {
  label: string
  color: string
  /** A swatch or a line, as the series is drawn. */
  shape?: 'box' | 'line' | 'dot'
}

export function ChartCard({
  legend = [],
  headline,
  children,
  className,
  footer,
}: {
  legend?: ReadonlyArray<LegendItem>
  /** The figure the chart is about, on the caption's right. */
  headline?: React.ReactNode
  children: React.ReactNode
  className?: string
  footer?: React.ReactNode
}) {
  return (
    <figure
      className={cn(
        'rounded-xl border border-border bg-surface px-2 py-2.5 text-muted',
        className,
      )}
    >
      {(legend.length > 0 || headline) && (
        <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1 text-[11px]">
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-block',
                    l.shape === 'line'
                      ? 'h-0.5 w-3'
                      : l.shape === 'dot'
                        ? 'size-2 rounded-full'
                        : 'size-2 rounded-sm opacity-70',
                  )}
                  style={{ background: l.color }}
                />
                {l.label}
              </span>
            ))}
          </span>
          {headline && <span>{headline}</span>}
        </figcaption>
      )}
      {children}
      {footer && <div className="mt-1 px-1 text-[11px]">{footer}</div>}
    </figure>
  )
}
