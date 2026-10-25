/**
 * A category league's Matchup at a glance: one row per category, the
 * Viewer's total and their opponent's either side of its name in the
 * middle (close enough to compare at a glance), and under them a bar from
 * the middle that leans toward whoever leads, as far as the lead is
 * decisive (categoryLean). A category someone leads carries an edge in
 * their color on their side (left for the Viewer, right for the opponent;
 * none while tied). A toggle in the caption swaps the whole Matchup's
 * totals for the day being looked at, so each row shows one figure a
 * side. HTML rather than a chart: it reads as a table, framed like the
 * app's charts (ChartCard, CHART_COLORS).
 */

import { useState } from 'react'
import { categoryRecord, dayRecord } from './format'
import type { CategoryResult } from '@/lib/fantasy/categories'
import type { MatchupView } from '@/lib/fantasy/matchup'
import { CHART_COLORS, ChartCard } from '@/components/charts/ChartCard'
import { categoryLean } from '@/lib/fantasy/categories'
import { cn } from '@/lib/utils'

/** The day the toggle can show: its name, and its categories once read. */
export interface CategoryDay {
  label: string
  categories: ReadonlyArray<CategoryResult> | null
}

/**
 * A row's edge: the leader's color on the leader's side. Both sides keep
 * a transparent edge, so every row's columns line up.
 */
function edge(leader: CategoryResult['leader']): React.CSSProperties {
  if (leader === 'mine') return { borderLeftColor: CHART_COLORS.mine }
  if (leader === 'opponent') return { borderRightColor: CHART_COLORS.opponent }
  return {}
}

export function CategoryBars({
  m,
  categories,
  day,
}: {
  m: MatchupView
  categories: NonNullable<MatchupView['categories']>
  day?: CategoryDay
}) {
  const [view, setView] = useState<'matchup' | 'day'>('matchup')
  const showDay = day !== undefined && view === 'day'
  const loading = showDay && day.categories === null
  // The row's figures in view: the Matchup's, or the day's (none yet
  // while it loads, or for a category the day didn't record).
  const shown = (c: CategoryResult) =>
    showDay ? day.categories?.find((d) => d.statId === c.statId) : c
  const value = (leading: boolean, trailing: boolean, color: string) => ({
    className: cn(
      'text-lg leading-none tabular-nums',
      leading ? 'font-bold' : trailing ? 'text-foreground/55' : 'font-medium',
    ),
    style: leading ? { color } : undefined,
  })
  const option = (key: 'matchup' | 'day', label: string, record: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={view === key}
      onClick={() => setView(key)}
      className={cn(
        'min-h-7 rounded-full px-2.5 tabular-nums transition-colors',
        view === key ? 'bg-background text-foreground shadow-sm' : 'text-muted',
      )}
    >
      {label} <span className="font-semibold">{record}</span>
    </button>
  )
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        Categories
      </h3>
      <ChartCard
        legend={[
          { label: m.mine.abbrev, color: CHART_COLORS.mine },
          ...(m.opponent
            ? [{ label: m.opponent.abbrev, color: CHART_COLORS.opponent }]
            : []),
        ]}
        headline={
          day ? (
            <span
              role="radiogroup"
              aria-label="Show categories for"
              className="flex gap-0.5 rounded-full bg-notice p-0.5"
            >
              {option('matchup', 'Matchup', categoryRecord(m))}
              {option(
                'day',
                day.label,
                day.categories ? dayRecord(day.categories) : '…',
              )}
            </span>
          ) : (
            <span className="font-semibold text-foreground tabular-nums">
              {categoryRecord(m)}
            </span>
          )
        }
      >
        <ul className="flex flex-col gap-1 pt-1">
          {categories.map((c) => {
            const r = shown(c)
            const leader = r?.leader ?? null
            const lean = r ? categoryLean(r) : 0
            const mine = leader === 'mine'
            const theirs = leader === 'opponent'
            const figure = (side: 'mine' | 'opponent') =>
              loading ? '…' : (r?.[side] ?? '—')
            return (
              <li
                key={c.statId}
                className="flex flex-col gap-1.5 border-x-[3px] border-transparent px-1.5 py-1.5"
                style={edge(leader)}
              >
                <span className="grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-baseline gap-2">
                  <span
                    {...value(mine, theirs, CHART_COLORS.mine)}
                    className={cn(
                      value(mine, theirs, CHART_COLORS.mine).className,
                      'text-right',
                    )}
                  >
                    {figure('mine')}
                  </span>
                  <span className="text-center text-[11px] leading-none font-semibold text-muted">
                    {c.label}
                    {c.reverse && (
                      <span className="sr-only"> (lower is better)</span>
                    )}
                    {leader === 'tie' && (
                      <span className="sr-only"> (tied)</span>
                    )}
                  </span>
                  <span {...value(theirs, mine, CHART_COLORS.opponent)}>
                    {figure('opponent')}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="relative h-1.5 w-full rounded-full bg-notice"
                >
                  <span className="absolute top-[-2px] left-1/2 h-[10px] w-px -translate-x-1/2 bg-border" />
                  {lean !== 0 && (
                    <span
                      className="absolute top-0 h-full rounded-full"
                      style={{
                        width: `${Math.abs(lean) * 50}%`,
                        background:
                          lean > 0 ? CHART_COLORS.mine : CHART_COLORS.opponent,
                        ...(lean > 0 ? { right: '50%' } : { left: '50%' }),
                      }}
                    />
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </ChartCard>
    </section>
  )
}
