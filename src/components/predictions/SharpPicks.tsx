/**
 * Sharp picks (CONTEXT.md, "Sharp pick"; docs/adr/0006): the day's five
 * Kalshi prices furthest below the sharp books' fair price, after
 * Kalshi's fee, and one combo; each graded by how much edge it really has,
 * re-checked until its Game starts, then judged by the closing price and
 * the result. Plus the picks' own track record.
 */

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SharpPick } from '@/lib/sharp/server'
import type { RecordEntry } from '@/lib/kalshi/record'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { clockTime, shortDate } from '@/components/charts/format'
import { CalibrationChart } from '@/components/charts/lazy'
import { calibrationOf } from '@/lib/kalshi/record'
import { picksRecord } from '@/lib/sharp/record'
import { useSharpHistory, useSharpSlate } from '@/lib/sharp/useSharp'
import { cn } from '@/lib/utils'

const cents = (p: number) => `${Math.round(p * 100)}¢`
const pct1 = (p: number) => `${(p * 100).toFixed(1)}%`
const pts = (p: number) =>
  `${p >= 0 ? '+' : '−'}${Math.abs(p * 100).toFixed(1)} pts`

const SOURCE_NAMES: Record<string, string> = {
  pinnacle: 'Pinnacle',
  novig: 'Novig',
  polymarket: 'Polymarket',
  betonline: 'BetOnline',
  draftkings: 'DraftKings',
}

const KIND_NAMES = { moneyline: 'Winner', spread: 'Spread', total: 'Total' }

const GRADES = {
  strong: {
    label: 'Strong',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
  edge: { label: 'Edge', className: 'bg-accent/15 text-accent' },
  thin: { label: 'Thin', className: 'bg-notice text-muted' },
} as const

/** A Kalshi page for the market's series (its events are listed there). */
function kalshiUrl(ticker: string): string {
  return `https://kalshi.com/markets/${ticker.split('-')[0].toLowerCase()}`
}

export function SharpPicksSection() {
  const slate = useSharpSlate()
  const [explain, setExplain] = useState(false)
  if (slate.isPending) return null
  const data = slate.data
  const singles = data?.picks.filter((p) => p.kind === 'single') ?? []
  const combo = data?.picks.find((p) => p.kind === 'combo')
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold tracking-wide text-muted uppercase">
          Sharp picks
          {data && (
            <span className="ml-1 font-normal normal-case">
              · {shortDate(data.day)}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setExplain((e) => !e)}
          aria-expanded={explain}
          className="text-xs font-semibold text-accent"
        >
          {explain ? 'Hide' : 'How picks work'}
        </button>
      </div>
      {explain && <Explainer />}
      {!data ? (
        <p className="rounded-xl border border-border bg-surface px-3 py-4 text-center text-sm text-muted">
          The first slate comes out at 10am Eastern.
        </p>
      ) : (
        <>
          <ol className="flex flex-col gap-2">
            {singles.map((p) => (
              <li key={p.id}>
                <PickCard pick={p} />
              </li>
            ))}
          </ol>
          {combo && <ComboCard pick={combo} />}
        </>
      )}
      <PicksRecord />
    </section>
  )
}

/** "How picks work", drawn: the edge, the cut to five, the grades, the close. */
function Explainer() {
  return (
    <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Step
        n={1}
        caption="Kalshi vs the sharp books. The gap after the fee is the edge."
      >
        <EdgeBar />
      </Step>
      <Step
        n={2}
        caption="Every NFL, NBA, MLB and NHL market, cut to the biggest edges."
      >
        <Funnel />
      </Step>
      <Step
        n={3}
        caption="Some days Kalshi is priced about right, so picks are Thin."
      >
        <GradeScale />
      </Step>
      <Step
        n={4}
        caption="Kalshi moving toward the pick before the game: a good pick, win or lose."
      >
        <CloseLine />
      </Step>
    </ol>
  )
}

function Step({
  n,
  caption,
  children,
}: {
  n: number
  caption: string
  children: ReactNode
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="min-h-16">{children}</div>
      <p className="flex gap-1.5 text-[12px] leading-snug text-muted">
        <span className="font-bold text-foreground">{n}</span>
        {caption}
      </p>
    </li>
  )
}

/** 44¢ on Kalshi, 2¢ fee, 48% fair: +2 pts of edge, on a 38–54% track. */
function EdgeBar() {
  const at = (p: number) => `${((p - 0.38) / 0.16) * 100}%`
  const span = (p: number) => `${(p / 0.16) * 100}%`
  return (
    <div className="pt-1 text-[11px] tabular-nums">
      <div className="relative h-4 font-semibold">
        <span
          className="absolute -translate-x-full pr-1.5"
          style={{ left: at(0.44) }}
        >
          Kalshi 44¢
        </span>
        <span
          className="absolute pl-1.5 text-scoring"
          style={{ left: at(0.48) }}
        >
          Fair 48%
        </span>
      </div>
      <div className="relative mt-1 h-2.5 rounded-full bg-notice">
        <span
          className="absolute inset-y-0 bg-muted/50"
          style={{ left: at(0.44), width: span(0.02) }}
        />
        <span
          className="absolute inset-y-0 bg-scoring"
          style={{ left: at(0.46), width: span(0.02) }}
        />
        {[0.44, 0.48].map((p) => (
          <span
            key={p}
            className="absolute -top-0.5 h-3.5 w-0.5 -translate-x-1/2 rounded bg-foreground"
            style={{ left: at(p) }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-3 text-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-muted/50" />
          2¢ fee
        </span>
        <span className="flex items-center gap-1 font-semibold text-scoring">
          <span className="h-2 w-3 rounded-sm bg-scoring" />
          +2 pts edge
        </span>
      </div>
    </div>
  )
}

function Funnel() {
  const rows = [
    { label: '~600 prices', width: '100%', className: 'bg-notice' },
    { label: 'priced vs fair', width: '72%', className: 'bg-accent/20' },
    {
      label: '5 picks + combo',
      width: '44%',
      className: 'bg-accent text-white',
    },
  ]
  return (
    <div className="flex flex-col items-center gap-1 text-[11px] font-semibold">
      {rows.map((r) => (
        <span
          key={r.label}
          className={cn('rounded-md py-1 text-center', r.className)}
          style={{ width: r.width }}
        >
          {r.label}
        </span>
      ))}
      <span className="mt-0.5 flex gap-1 text-[10px] font-normal text-muted">
        <span className="rounded bg-notice px-1.5 py-0.5">1 per game</span>
        <span className="rounded bg-notice px-1.5 py-0.5">2 per sport</span>
      </span>
    </div>
  )
}

function GradeScale() {
  const bands = [
    { grade: 'thin' as const, range: 'under 1 pt', bar: 'bg-muted/40' },
    { grade: 'edge' as const, range: '1–3 pts', bar: 'bg-accent' },
    { grade: 'strong' as const, range: '3+ pts', bar: 'bg-emerald-500' },
  ]
  return (
    <div className="grid grid-cols-3 gap-1 pt-2">
      {bands.map((b) => (
        <span key={b.grade} className="flex flex-col items-center gap-1.5">
          <span className={cn('h-2.5 w-full rounded-full', b.bar)} />
          <GradeChip grade={b.grade} />
          <span className="text-[10px] whitespace-nowrap text-muted tabular-nums">
            {b.range}
          </span>
        </span>
      ))}
    </div>
  )
}

/** The pick at 44¢; Kalshi at 47¢ by the start: beat the close by 3. */
function CloseLine() {
  const path = [44, 44.5, 44, 45.5, 46, 45.5, 47]
  const x = (i: number) => 8 + (i / (path.length - 1)) * 184
  const y = (c: number) => 52 - ((c - 43) / 5) * 44
  return (
    <svg
      viewBox="0 0 200 60"
      className="h-16 w-full overflow-visible text-[9px]"
      role="img"
      aria-label="Picked at 44 cents, closed at 47 cents"
    >
      <line
        x1={8}
        x2={192}
        y1={y(44)}
        y2={y(44)}
        className="stroke-muted/40"
        strokeDasharray="3 3"
      />
      <polyline
        points={path.map((c, i) => `${x(i)},${y(c)}`).join(' ')}
        fill="none"
        className="stroke-scoring"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <circle cx={x(0)} cy={y(44)} r={3.5} className="fill-foreground" />
      <circle
        cx={x(path.length - 1)}
        cy={y(47)}
        r={3.5}
        className="fill-scoring"
      />
      <text x={x(0)} y={y(44) + 12} className="fill-muted">
        pick 44¢
      </text>
      <text
        x={x(path.length - 1)}
        y={y(47) - 7}
        textAnchor="end"
        className="fill-scoring font-semibold"
      >
        close 47¢ · +3
      </text>
      <text x={192} y={y(44) + 12} textAnchor="end" className="fill-muted">
        game starts
      </text>
    </svg>
  )
}

function GradeChip({ grade }: { grade: SharpPick['grade'] }) {
  return (
    <span
      className={cn(
        'rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase',
        GRADES[grade].className,
      )}
    >
      {GRADES[grade].label}
    </span>
  )
}

/** Where the pick stands now: edge left, closing price, or the result. */
function Status({ pick: p }: { pick: SharpPick }) {
  if (p.result === 'won' || p.result === 'lost')
    return (
      <span
        className={cn(
          'font-semibold',
          p.result === 'won'
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-live',
        )}
      >
        {p.result === 'won' ? 'Won' : 'Lost'}
        {p.closingPrice !== null &&
          ` · closed ${cents(p.closingPrice)} (${pts(p.closingPrice - p.price)} vs pick)`}
      </span>
    )
  if (p.closingPrice !== null)
    return (
      <span>
        Underway · closed at {cents(p.closingPrice)}{' '}
        <span
          className={cn(
            'font-semibold',
            p.closingPrice > p.price
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-live',
          )}
        >
          {p.closingPrice > p.price ? 'beat the close' : 'missed the close'}
        </span>
      </span>
    )
  if (p.currentPrice !== null && p.currentEdge !== null)
    return p.currentEdge < 0 ? (
      <span className="font-semibold text-live">
        Edge gone · now {cents(p.currentPrice)}
      </span>
    ) : (
      <span>
        Now {cents(p.currentPrice)} · {pts(p.currentEdge)} left
      </span>
    )
  return <span>Starts {clockTime(p.startsAt)}</span>
}

function PickCard({ pick: p }: { pick: SharpPick }) {
  return (
    <article className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <header className="flex items-center gap-2 text-[11px] text-muted">
        <span className="font-bold text-foreground">#{p.rank}</span>
        {p.league && <LeagueLogo league={p.league} size={14} />}
        <span className="truncate">
          {p.gameLabel} · {clockTime(p.startsAt)}
        </span>
        <span className="ml-auto">
          <GradeChip grade={p.grade} />
        </span>
      </header>
      <div className="mt-1 flex items-end justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-lg leading-tight font-bold">
            {p.title}
          </span>
          <span className="text-[11px] text-muted">
            {p.marketKind ? KIND_NAMES[p.marketKind] : ''} · Kalshi{' '}
            {p.side?.toUpperCase()}
          </span>
        </span>
        <span className="shrink-0 text-right tabular-nums">
          <span className="block text-lg leading-tight font-bold">
            {cents(p.price)}
          </span>
          <span className="text-[11px] text-muted">fair {pct1(p.fair)}</span>
        </span>
      </div>
      <p className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[12px] tabular-nums">
        <span
          className={cn(
            'font-semibold',
            p.edge > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-muted',
          )}
        >
          {pts(p.edge)} edge after {cents(p.fee)} fee ·{' '}
          {(p.evPerDollar * 100).toFixed(1)}% per $
        </span>
        <span className="text-muted">
          <Status pick={p} />
        </span>
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
        {p.sources.map((s) => (
          <span
            key={s.source}
            className="rounded bg-notice px-1.5 py-0.5 tabular-nums"
          >
            {SOURCE_NAMES[s.source] ?? s.source}{' '}
            {pct1(p.side === 'no' ? 1 - s.prob : s.prob)}
          </span>
        ))}
        {p.marketTicker && (
          <a
            href={kalshiUrl(p.marketTicker)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto font-semibold text-accent"
          >
            Kalshi ↗
          </a>
        )}
      </div>
    </article>
  )
}

function ComboCard({ pick: p }: { pick: SharpPick }) {
  return (
    <article className="rounded-xl border border-accent/40 bg-surface px-3 py-2.5">
      <header className="flex items-center gap-2 text-[11px] text-muted">
        <span className="rounded bg-accent/15 px-1.5 py-0.5 font-bold text-accent">
          Combo
        </span>
        <span>{p.legs?.length ?? 0} legs, different games</span>
        <span className="ml-auto">
          <GradeChip grade={p.grade} />
        </span>
      </header>
      <ul className="mt-2 divide-y divide-border">
        {(p.legs ?? []).map((l) => (
          <li
            key={l.marketTicker + l.side}
            className="flex items-center gap-2 py-1.5 text-sm"
          >
            <LeagueLogo league={l.league} size={14} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{l.title}</span>
              <span className="block truncate text-[11px] text-muted">
                {l.gameLabel} · {clockTime(l.startsAt)}
              </span>
            </span>
            <span className="text-right text-[12px] tabular-nums">
              <span className="block font-semibold">
                {l.result === 'won' ? '✓ ' : l.result === 'lost' ? '✕ ' : ''}
                {cents(l.price)}
              </span>
              <span className="text-muted">fair {pct1(l.fair)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center tabular-nums">
        <span>
          <span className="block text-base font-bold">{pct1(p.fair)}</span>
          <span className="text-[10px] text-muted uppercase">Fair</span>
        </span>
        <span>
          <span className="block text-base font-bold">{cents(p.price)}</span>
          <span className="text-[10px] text-muted uppercase">
            Legs multiply
          </span>
        </span>
        <span>
          <span className="block text-base font-bold text-emerald-600 dark:text-emerald-400">
            {cents(p.worthItUnder ?? 0)}
          </span>
          <span className="text-[10px] text-muted uppercase">
            Worth it under
          </span>
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        Kalshi quotes combos on request: build it there and take it if the quote
        is under {cents(p.worthItUnder ?? 0)}.
        {p.result && (
          <span
            className={cn(
              'ml-1 font-semibold',
              p.result === 'won'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-live',
            )}
          >
            {p.result === 'won' ? 'Won.' : 'Lost.'}
          </span>
        )}
      </p>
    </article>
  )
}

/** The picks' track record: closing line value, results, return, calibration. */
function PicksRecord() {
  const history = useSharpHistory()
  const rows = useMemo(() => history.data ?? [], [history.data])
  const record = useMemo(() => picksRecord(rows), [rows])
  const calibration = useMemo(
    () =>
      calibrationOf(
        rows
          .filter((r) => r.kind === 'single')
          .map((r): RecordEntry => ({
            id: r.id,
            kind: 'single',
            title: '',
            cost: r.price,
            status: r.result ? 'settled' : 'open',
            result: r.result,
            pnl: null,
            madeAt: `${r.day}T12:00:00Z`,
            settledAt: null,
            legs: [],
            entryChance: r.fair,
          })),
        { from: null, to: null },
      ),
    [rows],
  )
  if (rows.length === 0) return null
  const s = record.singles
  const tiles = [
    {
      label: 'Beat the close',
      value: s.closed ? `${Math.round((s.beatClose / s.closed) * 100)}%` : '—',
      sub: s.closed ? `${s.beatClose} of ${s.closed}` : 'after first starts',
    },
    {
      label: 'Avg vs close',
      value: s.avgClv === null ? '—' : pts(s.avgClv),
      sub: 'closing line value',
    },
    {
      label: 'Record',
      value: `${s.won}–${s.lost}`,
      sub:
        s.roi === null
          ? 'none settled'
          : `${s.roi >= 0 ? '+' : '−'}${Math.abs(Math.round(s.roi * 100))}% return`,
    },
  ]
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
        Picks record · {s.picks} picks
      </h3>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface px-3 py-2">
            <span className="block text-[10px] font-semibold tracking-wide text-muted uppercase">
              {t.label}
            </span>
            <span className="block text-lg leading-tight font-bold tabular-nums">
              {t.value}
            </span>
            <span className="text-[11px] text-muted">{t.sub}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_3.5rem_3.5rem_3.5rem] gap-x-2 gap-y-1 text-[12px] tabular-nums">
          {['Grade', '#', 'Close', 'W–L', 'Return'].map((h, i) => (
            <span
              key={h}
              className={cn(
                'text-[10px] font-semibold tracking-wide text-muted uppercase',
                i > 0 && 'text-right',
              )}
            >
              {h}
            </span>
          ))}
          {[...record.byGrade, record.combos].map((l) => (
            <Fragmentless key={l.label} line={l} />
          ))}
        </div>
      </div>
      {calibration.count >= 10 && (
        <CalibrationChart
          calibration={calibration}
          copy={{
            x: 'Fair chance at the pick',
            y: 'How often it won',
            legend: 'Picks, by fair chance',
            versus: 'the fair price said',
            at: 'Fair at',
            noun: 'settled picks',
            footnote: 'On the line, the fair prices were right.',
          }}
        />
      )}
    </div>
  )
}

function Fragmentless({
  line: l,
}: {
  line: ReturnType<typeof picksRecord>['all']
}) {
  return (
    <>
      <span>{l.label}</span>
      <span className="text-right text-muted">{l.picks}</span>
      <span className="text-right">
        {l.avgClv === null ? '—' : pts(l.avgClv)}
      </span>
      <span className="text-right">
        {l.won}–{l.lost}
      </span>
      <span className="text-right">
        {l.roi === null
          ? '—'
          : `${l.roi >= 0 ? '+' : '−'}${Math.abs(Math.round(l.roi * 100))}%`}
      </span>
    </>
  )
}
