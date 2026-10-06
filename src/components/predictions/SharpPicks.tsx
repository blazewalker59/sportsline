/**
 * Sharp picks (CONTEXT.md, "Sharp pick"; docs/adr/0006): the day's five
 * Kalshi prices furthest below the sharp books' fair price, after
 * Kalshi's fee, and one combo; each graded by how much edge it really has,
 * re-checked until its Game starts, then judged by the closing price and
 * the result. Plus the picks' own track record.
 */

import { useMemo, useState } from 'react'
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

function Explainer() {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-muted">
      <p>
        Each morning, every Kalshi winner, spread and total for the day’s NFL,
        NBA, MLB and NHL games is priced against a <b>fair price</b>: the sharp
        books (Pinnacle, Novig, Polymarket, BetOnline, DraftKings) with their
        margins taken out, weighted toward the sharpest. A pick’s <b>edge</b> is
        the fair chance minus Kalshi’s price and fee.
      </p>
      <p className="mt-1.5">
        The five best by expected value per dollar go out, at most two per sport
        and one per game, mixing market types; the combo joins likely legs from
        different games. <b>Strong</b> is 3+ points of edge, <b>Edge</b> 1–3,{' '}
        <b>Thin</b> the best of a fairly priced day.
      </p>
      <p className="mt-1.5">
        The truest test is the <b>closing price</b>: picks that keep beating
        where Kalshi closes are sharp, whatever a few results say.
      </p>
    </div>
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
