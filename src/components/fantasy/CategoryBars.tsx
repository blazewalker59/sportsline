/**
 * A category league's Matchup at a glance: one row per category, the
 * Viewer's total on the left and their opponent's on the right, and a bar
 * from the middle that leans toward whoever leads, as far as the lead is
 * decisive (categoryLean). Each row's border is the leader's color (yellow
 * while tied), and under each total sits that side's figure for the day
 * being looked at. HTML rather than a chart: it reads as a table, framed
 * like the app's charts (ChartCard, CHART_COLORS).
 */

import { categoryRecord, dayRecord } from './format'
import type { CategoryResult } from '@/lib/fantasy/categories'
import type { MatchupView } from '@/lib/fantasy/matchup'
import { CHART_COLORS, ChartCard } from '@/components/charts/ChartCard'
import { categoryLean } from '@/lib/fantasy/categories'
import { cn } from '@/lib/utils'

/** The day under the totals: its name, and its categories once read. */
export interface CategoryDay {
  label: string
  categories: ReadonlyArray<CategoryResult> | null
}

/** A row's border: the leader's color, yellow for a tie, none before. */
function edge(leader: CategoryResult['leader']): {
  className: string
  style?: React.CSSProperties
} {
  if (leader === 'tie') return { className: 'border-yellow-500/80' }
  if (leader === null) return { className: 'border-transparent' }
  const color = leader === 'mine' ? CHART_COLORS.mine : CHART_COLORS.opponent
  return {
    className: '',
    style: { borderColor: `color-mix(in srgb, ${color} 60%, transparent)` },
  }
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
  const value = (leading: boolean, trailing: boolean, color: string) => ({
    className: cn(
      'tabular-nums text-sm leading-tight',
      leading ? 'font-bold' : trailing ? 'text-foreground/55' : 'font-medium',
    ),
    style: leading ? { color } : undefined,
  })
  const dayOf = (statId: number) =>
    day?.categories?.find((c) => c.statId === statId)
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
          <span className="tabular-nums">
            <span className="font-semibold text-foreground">
              {categoryRecord(m)}
            </span>
            {day && (
              <span>
                {' · '}
                {day.label}{' '}
                <span className="font-semibold text-foreground">
                  {day.categories ? dayRecord(day.categories) : '…'}
                </span>
              </span>
            )}
          </span>
        }
      >
        <ul className="flex flex-col gap-1 pt-1">
          {categories.map((c) => {
            const lean = categoryLean(c)
            const mine = c.leader === 'mine'
            const theirs = c.leader === 'opponent'
            const d = dayOf(c.statId)
            const border = edge(c.leader)
            const dayFigure = (
              side: 'mine' | 'opponent',
              align: 'left' | 'right',
            ) =>
              day && (
                <span
                  className={cn(
                    'text-[10.5px] leading-tight tabular-nums',
                    d?.leader === side
                      ? 'font-semibold text-foreground/80'
                      : 'text-muted',
                    align === 'right' && 'text-right',
                  )}
                >
                  {day.categories ? (d?.[side] ?? '—') : '…'}
                </span>
              )
            return (
              <li
                key={c.statId}
                className={cn(
                  'grid grid-cols-[3.75rem_minmax(0,1fr)_3.75rem] items-center gap-2 rounded-lg border-[1.5px] px-1.5 py-1',
                  border.className,
                )}
                style={border.style}
              >
                <span className="flex flex-col">
                  <span {...value(mine, theirs, CHART_COLORS.mine)}>
                    {c.mine}
                  </span>
                  {dayFigure('mine', 'left')}
                </span>
                <span className="flex flex-col items-center gap-1">
                  <span className="text-[11px] leading-none font-semibold text-muted">
                    {c.label}
                    {c.reverse && (
                      <span className="sr-only"> (lower is better)</span>
                    )}
                    {c.leader === 'tie' && (
                      <span className="sr-only"> (tied)</span>
                    )}
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
                            lean > 0
                              ? CHART_COLORS.mine
                              : CHART_COLORS.opponent,
                          ...(lean > 0 ? { right: '50%' } : { left: '50%' }),
                        }}
                      />
                    )}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span
                    {...value(theirs, mine, CHART_COLORS.opponent)}
                    className={cn(
                      value(theirs, mine, CHART_COLORS.opponent).className,
                      'text-right',
                    )}
                  >
                    {c.opponent}
                  </span>
                  {dayFigure('opponent', 'right')}
                </span>
              </li>
            )
          })}
        </ul>
      </ChartCard>
    </section>
  )
}
