/**
 * A category league's Matchup at a glance: one row per category, the
 * Viewer's total on the left and their opponent's on the right, and a bar
 * from the middle that leans toward whoever leads, as far as the lead is
 * decisive (categoryLean). HTML rather than a chart: it reads as a table,
 * framed like the app's charts (ChartCard, CHART_COLORS).
 */

import { categoryRecord } from './format'
import type { MatchupView } from '@/lib/fantasy/matchup'
import { CHART_COLORS, ChartCard } from '@/components/charts/ChartCard'
import { categoryLean } from '@/lib/fantasy/categories'
import { cn } from '@/lib/utils'

export function CategoryBars({
  m,
  categories,
}: {
  m: MatchupView
  categories: NonNullable<MatchupView['categories']>
}) {
  const value = (leading: boolean, trailing: boolean, color: string) => ({
    className: cn(
      'tabular-nums text-sm',
      leading ? 'font-bold' : trailing ? 'text-foreground/55' : 'font-medium',
    ),
    style: leading ? { color } : undefined,
  })
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
          <span className="font-semibold text-foreground tabular-nums">
            {categoryRecord(m)}
          </span>
        }
      >
        <ul className="flex flex-col gap-1.5 px-1 pt-1">
          {categories.map((c) => {
            const lean = categoryLean(c)
            const mine = c.leader === 'mine'
            const theirs = c.leader === 'opponent'
            return (
              <li
                key={c.statId}
                className="grid grid-cols-[3.75rem_minmax(0,1fr)_3.75rem] items-center gap-2"
              >
                <span {...value(mine, theirs, CHART_COLORS.mine)}>
                  {c.mine}
                </span>
                <span className="flex flex-col items-center gap-1">
                  <span className="text-[11px] leading-none font-semibold text-muted">
                    {c.label}
                    {c.reverse && (
                      <span className="sr-only"> (lower is better)</span>
                    )}
                    {c.leader === 'tie' && (
                      <span className="font-normal"> · tied</span>
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
                <span
                  {...value(theirs, mine, CHART_COLORS.opponent)}
                  className={cn(
                    value(theirs, mine, CHART_COLORS.opponent).className,
                    'text-right',
                  )}
                >
                  {c.opponent}
                </span>
              </li>
            )
          })}
        </ul>
      </ChartCard>
    </section>
  )
}
