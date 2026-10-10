/**
 * Sharp picks (CONTEXT.md, "Sharp pick"; docs/adr/0006): the day's five
 * Kalshi prices furthest below the sharp books' fair price, after
 * Kalshi's fee, and one combo; each graded by how much edge it really has,
 * re-checked until its Game starts, then judged by the closing price and
 * the result. Plus the picks' own track record.
 */

import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { SharpPick } from '@/lib/sharp/server'
import type { RecordEntry } from '@/lib/kalshi/record'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { clockTime, shortDate } from '@/components/charts/format'
import { CalibrationChart } from '@/components/charts/lazy'
import { calibrationOf } from '@/lib/kalshi/record'
import { picksRecord } from '@/lib/sharp/record'
import { useSharpHistory, useSharpSlate } from '@/lib/sharp/useSharp'
import { bannerVisible, kalshiEventUrl, slateSummary } from '@/lib/sharp/view'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { formatPrice } from '@/lib/model/price'
import { usePriceDisplay } from '@/lib/viewer/useViewer'
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

const DISMISSED_KEY = 'sportsline:sharp-banner-dismissed'

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

/**
 * On the Timeline's Predictions Scope: "Sharp picks available" for today's
 * slate, dismissable for the day; open, the picks in line.
 */
export function SharpPicksBanner() {
  const slate = useSharpSlate()
  const [dismissed, setDismissed] = useState(readDismissed)
  const [open, setOpen] = useState(false)
  const data = slate.data
  const today = sportsDayOf(new Date())
  if (!data || data.day !== today || !bannerVisible(data.day, dismissed))
    return null
  const summary = slateSummary(data.picks)
  const dismiss = () => {
    setDismissed(data.day)
    try {
      localStorage.setItem(DISMISSED_KEY, data.day)
    } catch {
      // Private mode: it stays dismissed for this visit only.
    }
  }
  return (
    <section className="overflow-hidden rounded-2xl border border-accent/40 bg-surface">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
        >
          <span className="size-2 shrink-0 rounded-full bg-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold">
              Sharp picks available
            </span>
            <span className="block truncate text-[11px] text-muted">
              {summary.singles} picks
              {summary.hasCombo && ' + combo'}
              {summary.strong > 0 && ` · ${summary.strong} strong`}
              {summary.best &&
                ` · best ${summary.best.title} ${pts(summary.best.edge)}`}
            </span>
          </span>
          <span
            className={cn(
              'text-muted transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden
          >
            ▾
          </span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss sharp picks for today"
          className="self-stretch px-3 text-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>
      {open && (
        <div className="border-t border-border">
          <SharpPicksList picks={data.picks} flush />
          <Link
            to="/predictions"
            className="block border-t border-border px-3 py-2 text-center text-xs font-semibold text-accent"
          >
            Record and how picks work ›
          </Link>
        </div>
      )}
    </section>
  )
}

/** The slate: one compact row per pick, then the combo; tap a row for more. */
export function SharpPicksList({
  picks,
  flush = false,
}: {
  picks: ReadonlyArray<SharpPick>
  /** Inside another card: no border of its own. */
  flush?: boolean
}) {
  const singles = picks.filter((p) => p.kind === 'single')
  const combo = picks.find((p) => p.kind === 'combo')
  return (
    <ol
      className={cn(
        'divide-y divide-border',
        !flush && 'overflow-hidden rounded-xl border border-border bg-surface',
      )}
    >
      {singles.map((p) => (
        <li key={p.id}>
          <PickRow pick={p} />
        </li>
      ))}
      {combo && (
        <li>
          <ComboRow pick={combo} />
        </li>
      )}
    </ol>
  )
}

export function SharpPicksSection() {
  const slate = useSharpSlate()
  const [explain, setExplain] = useState(false)
  if (slate.isPending) return null
  const data = slate.data
  return (
    <section className="flex flex-col gap-2">
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
        <SharpPicksList picks={data.picks} />
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
        caption="Main lines only, cut to the biggest edges that recent form doesn't argue against."
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
        <span className="rounded bg-notice px-1.5 py-0.5">main lines</span>
        <span className="rounded bg-notice px-1.5 py-0.5">form</span>
        <span className="rounded bg-notice px-1.5 py-0.5">1 per game</span>
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

/** Where the pick stands: its start time, then live, then the result. */
function statusOf(p: SharpPick): { text: string; tone: 'good' | 'bad' | null } {
  if (p.result === 'won') return { text: 'Won', tone: 'good' }
  if (p.result === 'lost') return { text: 'Lost', tone: 'bad' }
  if (Date.now() >= Date.parse(p.startsAt)) return { text: 'Live', tone: null }
  return { text: clockTime(p.startsAt), tone: null }
}

function StatusText({ pick }: { pick: SharpPick }) {
  const s = statusOf(pick)
  return (
    <span
      className={cn(
        'shrink-0',
        s.tone === 'good' &&
          'font-semibold text-emerald-600 dark:text-emerald-400',
        s.tone === 'bad' && 'font-semibold text-live',
      )}
    >
      {s.text}
    </span>
  )
}

/** The grade and the edge in one chip: "Strong +3.1". */
function EdgeChip({ pick: p }: { pick: SharpPick }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
        GRADES[p.grade].className,
      )}
    >
      {GRADES[p.grade].label}{' '}
      {(p.edge >= 0 ? '+' : '−') + Math.abs(p.edge * 100).toFixed(1)}
    </span>
  )
}

function KalshiLink({
  ticker,
  gameTitle,
}: {
  ticker: string
  gameTitle?: string | null
}) {
  return (
    <a
      href={kalshiEventUrl(ticker, gameTitle)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white"
    >
      Open in Kalshi
    </a>
  )
}

function PickRow({ pick: p }: { pick: SharpPick }) {
  const [open, setOpen] = useState(false)
  const display = usePriceDisplay()
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          {p.league && <LeagueLogo league={p.league} size={14} />}
          <span className="truncate text-sm font-bold">{p.title}</span>
          <span className="truncate text-[11px] text-muted">{p.gameLabel}</span>
          <span className="ml-auto">
            <EdgeChip pick={p} />
          </span>
        </span>
        <span className="flex items-baseline gap-2 text-[12px] tabular-nums">
          <span className="min-w-0 flex-1 truncate text-muted">
            Kalshi{' '}
            <b className="text-foreground">{formatPrice(p.price, display)}</b> ·
            sharp books <b className="text-foreground">{pct1(p.fair)}</b>
          </span>
          <StatusText pick={p} />
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-2.5 text-[12px] text-muted tabular-nums">
          <p>
            {display === 'multiplier'
              ? `Pays ${formatPrice(p.price, display)} after the fee (${cents(p.price)} + ${cents(p.fee)})`
              : `${cents(p.price)} + ${cents(p.fee)} fee = ${cents(p.price + p.fee)}`}{' '}
            for something the books give a {pct1(p.fair)} chance:{' '}
            <b className="text-foreground">{pts(p.edge)}</b>.{' '}
            {p.marketKind && KIND_NAMES[p.marketKind]}, Kalshi{' '}
            {p.side?.toUpperCase()}, {clockTime(p.startsAt)}.
          </p>
          {p.form && (
            <p>
              <b
                className={cn(
                  p.form.lean > 0.05
                    ? 'text-scoring'
                    : p.form.lean < -0.05
                      ? 'text-live'
                      : 'text-foreground',
                )}
              >
                {p.form.lean > 0.05
                  ? 'Form backs it'
                  : p.form.lean < -0.05
                    ? 'Form leans against'
                    : 'Form is even'}
              </b>
              : {p.form.note}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {p.sources.map((s) => (
              <span key={s.source} className="rounded bg-notice px-1.5 py-0.5">
                {SOURCE_NAMES[s.source] ?? s.source}{' '}
                {pct1(p.side === 'no' ? 1 - s.prob : s.prob)}
              </span>
            ))}
            {p.marketTicker && (
              <span className="ml-auto">
                <KalshiLink ticker={p.marketTicker} gameTitle={p.gameTitle} />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ComboRow({ pick: p }: { pick: SharpPick }) {
  const [open, setOpen] = useState(false)
  const display = usePriceDisplay()
  const worth = formatPrice(p.worthItUnder ?? 0, display)
  const legs = p.legs ?? []
  return (
    <div className="bg-accent/5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold">Combo</span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
            {legs.map((l) => l.title).join(' + ')}
          </span>
          <EdgeChip pick={p} />
        </span>
        <span className="flex items-baseline gap-2 text-[12px] tabular-nums">
          <span className="min-w-0 flex-1 truncate text-muted">
            {display === 'multiplier' ? 'Take it at' : 'Take it under'}{' '}
            <b className="text-foreground">{worth}</b>
            {display === 'multiplier' ? ' or more' : ''} · sharp books{' '}
            <b className="text-foreground">{pct1(p.fair)}</b>
          </span>
          {p.result && <StatusText pick={p} />}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 text-[12px] text-muted tabular-nums">
          <ul className="flex flex-col gap-1">
            {legs.map((l) => (
              <li
                key={l.marketTicker + l.side}
                className="flex items-center gap-2"
              >
                <LeagueLogo league={l.league} size={12} />
                <span className="min-w-0 flex-1 truncate">
                  <b className="text-foreground">{l.title}</b> {l.gameLabel}
                </span>
                <span>
                  {l.result === 'won' ? '✓ ' : l.result === 'lost' ? '✕ ' : ''}
                  {formatPrice(l.price, display)} · {pct1(l.fair)}
                </span>
                <a
                  href={kalshiEventUrl(l.marketTicker, l.gameTitle)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${l.gameLabel} in Kalshi`}
                  className="shrink-0 font-bold text-accent"
                >
                  Kalshi
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-1.5">
            Kalshi prices combos when you build one. The books give all the legs
            a {pct1(p.fair)} chance, so any quote{' '}
            {display === 'multiplier'
              ? `paying ${worth} or more`
              : `under ${worth} (the legs cost ${cents(p.price)} multiplied)`}{' '}
            is worth taking.
          </p>
        </div>
      )}
    </div>
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
