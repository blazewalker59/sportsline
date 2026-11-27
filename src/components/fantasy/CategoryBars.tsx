/**
 * A category league's Matchup at a glance: one row per category, the
 * Viewer's total and their opponent's either side of its name in the
 * middle (close enough to compare at a glance), and under them a bar from
 * the middle that leans toward whoever leads, as far as the lead is
 * decisive (categoryLean); the leader's figure is bold in their color.
 * A toggle in the caption swaps the whole Matchup's
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
import { LeanMeter } from '@/components/charts/LeanMeter'
import { SectionLabel } from '@/components/signal/Section'
import { cn } from '@/lib/utils'

/** The day the toggle can show: its name, and its categories once read. */
export interface CategoryDay {
  label: string
  categories: ReadonlyArray<CategoryResult> | null
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
        'min-h-7 rounded-[8px] px-2.5 text-3xs whitespace-nowrap tabular-nums uppercase transition-colors',
        view === key ? 'panel bg-surface text-foreground' : 'text-muted',
      )}
    >
      {label} <span className="font-bold">{record}</span>
    </button>
  )
  return (
    <section>
      <SectionLabel as="h3" title="Categories" />
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
              className="well flex gap-0.5 rounded-[10px] p-[3px]"
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
                className="flex flex-col gap-1.5 px-1.5 py-1.5"
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
                  <span
                    data-category-label=""
                    className="text-center text-3xs leading-none text-muted uppercase"
                  >
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
                <LeanMeter
                  lean={lean}
                  left={CHART_COLORS.mine}
                  right={CHART_COLORS.opponent}
                />
              </li>
            )
          })}
        </ul>
      </ChartCard>
    </section>
  )
}
