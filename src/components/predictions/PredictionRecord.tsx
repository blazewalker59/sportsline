/**
 * The Viewer's Record (CONTEXT.md): volume and results over a range (7
 * days by default; 30 days, all time, or a custom range), the trend, the
 * patterns worth noticing, and where they win and lose.
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import type {
  Calibration,
  Line,
  PredictionRecord,
  Range,
} from '@/lib/kalshi/record'
import { CalibrationChart, RecordTrend } from '@/components/charts/lazy'
import { buildRecord, calibrationOf, winRate } from '@/lib/kalshi/record'
import { usePredictionRecord } from '@/lib/kalshi/usePredictions'
import { cn } from '@/lib/utils'

type RangeKey = '7d' | '30d' | 'all' | 'custom'
const RANGE_KEY = 'sportsline:recordRange'

const usd = (n: number) =>
  `$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  })}`
const signed = (n: number) =>
  `${n > 0.004 ? '+' : n < -0.004 ? '−' : ''}${usd(n)}`
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)
const tone = (n: number) =>
  n > 0.004 ? 'text-scoring' : n < -0.004 ? 'text-live' : 'text-muted'

const dayInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const startOfDay = (s: string) => new Date(`${s}T00:00:00`)

function readRange(): RangeKey {
  try {
    const v = localStorage.getItem(RANGE_KEY)
    return v === '30d' || v === 'all' || v === 'custom' ? v : '7d'
  } catch {
    return '7d'
  }
}

export function PredictionRecordSection() {
  const history = usePredictionRecord()
  // The remembered range loads after the first render (it's on the device,
  // so the server can't render it).
  const [key, setKey] = useState<RangeKey>('7d')
  useEffect(() => setKey(readRange()), [])
  const [custom, setCustom] = useState(() => ({
    from: dayInput(new Date(Date.now() - 13 * 86_400_000)),
    to: dayInput(new Date()),
  }))
  const choose = (k: RangeKey) => {
    setKey(k)
    try {
      localStorage.setItem(RANGE_KEY, k)
    } catch {
      // Remembering the range is a convenience.
    }
  }
  const range = useMemo((): Range => {
    const now = Date.now()
    if (key === '7d') return { from: new Date(now - 7 * 86_400_000), to: null }
    if (key === '30d')
      return { from: new Date(now - 30 * 86_400_000), to: null }
    if (key === 'custom') {
      const to = startOfDay(custom.to)
      to.setDate(to.getDate() + 1)
      return { from: startOfDay(custom.from), to }
    }
    return { from: null, to: null }
  }, [key, custom])
  const record = useMemo(
    () => (history.data ? buildRecord(history.data, range) : null),
    [history.data, range],
  )
  const calibration = useMemo(
    () => (history.data ? calibrationOf(history.data, range) : null),
    [history.data, range],
  )

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold tracking-wide text-muted uppercase">
          Your record
        </h2>
        <span
          role="radiogroup"
          aria-label="Range"
          className="flex gap-0.5 rounded-full bg-notice p-0.5"
        >
          {(
            [
              ['7d', '7D'],
              ['30d', '30D'],
              ['all', 'All'],
              ['custom', 'Custom'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={key === k}
              onClick={() => choose(k)}
              className={cn(
                'min-h-7 rounded-full px-2.5 text-xs font-semibold transition-colors',
                key === k
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted',
              )}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      {key === 'custom' && (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            aria-label="From"
            value={custom.from}
            max={custom.to}
            onChange={(e) =>
              e.target.value &&
              setCustom((c) => ({ ...c, from: e.target.value }))
            }
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5"
          />
          <span className="text-muted">to</span>
          <input
            type="date"
            aria-label="To"
            value={custom.to}
            min={custom.from}
            onChange={(e) =>
              e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))
            }
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5"
          />
        </div>
      )}
      {history.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !record || record.totals.count === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-3 py-4 text-center text-sm text-muted">
          No predictions in this range.
        </p>
      ) : (
        <RecordBody record={record} calibration={calibration} />
      )}
    </section>
  )
}

function RecordBody({
  record: r,
  calibration,
}: {
  record: PredictionRecord
  calibration: Calibration | null
}) {
  const t = r.totals
  return (
    <>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
        <Stat label="Volume" value={usd(t.staked)} />
        <Stat
          label="Predictions"
          value={String(t.count)}
          sub={t.open > 0 ? `${t.open} open` : undefined}
        />
        <Stat
          label="Net P&L"
          value={signed(t.pnl)}
          className={tone(t.pnl)}
          sub={t.settled > 0 ? `${t.settled} settled` : 'none settled'}
        />
        <Stat
          label="Win rate"
          value={pct(winRate(t))}
          sub={`${t.won}–${t.lost}`}
        />
        <Stat
          label="Return"
          value={pct(t.roi)}
          className={t.roi === null ? undefined : tone(t.roi)}
          sub="on settled"
        />
        <Stat label="Avg stake" value={usd(t.avgStake)} />
      </div>

      {r.days.length > 1 && <RecordTrend days={r.days} />}

      {calibration && calibration.count > 0 && (
        <CalibrationChart calibration={calibration} />
      )}

      {r.insights.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface px-3 py-2.5">
          {r.insights.map((i) => (
            <li key={i.text} className="flex items-start gap-2 text-[13px]">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1.5 size-1.5 shrink-0 rounded-full',
                  i.tone === 'good'
                    ? 'bg-scoring'
                    : i.tone === 'bad'
                      ? 'bg-live'
                      : 'bg-muted',
                )}
              />
              {i.text}
            </li>
          ))}
        </ul>
      )}

      <Breakdowns record={r} />

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {r.streak && (
          <span>
            Streak:{' '}
            <span
              className={cn(
                'font-semibold',
                r.streak.kind === 'won' ? 'text-scoring' : 'text-live',
              )}
            >
              {r.streak.length}
              {r.streak.kind === 'won' ? 'W' : 'L'}
            </span>
          </span>
        )}
        {r.longestWin > 1 && <span>Longest win run: {r.longestWin}</span>}
        {t.best && (
          <span>
            Best: <span className="text-scoring">{signed(t.best.pnl!)}</span>
          </span>
        )}
        {t.worst && (
          <span>
            Worst: <span className="text-live">{signed(t.worst.pnl!)}</span>
          </span>
        )}
        {t.open > 0 && <span>Open stake: {usd(t.openStaked)}</span>}
      </p>
    </>
  )
}

function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string
  value: string
  sub?: string
  className?: string
}) {
  return (
    <div className="flex flex-col bg-surface px-3 py-2">
      <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
        {label}
      </span>
      <span
        className={cn(
          'text-lg leading-tight font-bold tabular-nums',
          className,
        )}
      >
        {value}
      </span>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </div>
  )
}

type Tab = 'sport' | 'market' | 'size' | 'legs'

function Breakdowns({ record: r }: { record: PredictionRecord }) {
  const [tab, setTab] = useState<Tab>('sport')
  const tabs: Array<[Tab, string, boolean]> = [
    ['sport', 'Sport', true],
    ['market', 'Market', true],
    ['size', 'Combo size', r.byComboSize.length > 0],
    ['legs', 'Legs', r.legs.byMarket.length > 0],
  ]
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <div role="tablist" className="mb-2 flex gap-3 text-xs font-semibold">
        {tabs
          .filter(([, , shown]) => shown)
          .map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'border-b-2 pb-1 transition-colors',
                tab === k
                  ? 'border-accent text-foreground'
                  : 'border-transparent text-muted',
              )}
            >
              {label}
            </button>
          ))}
      </div>
      {tab === 'legs' ? (
        <LegTable record={r} />
      ) : (
        <LineTable
          lines={
            tab === 'sport'
              ? r.bySport
              : tab === 'market'
                ? r.byMarket
                : r.byComboSize
          }
        />
      )}
    </div>
  )
}

const head =
  'text-right text-[10px] font-semibold tracking-wide text-muted uppercase'

/** Each group's count, win rate, stake and P&L, aligned like a table. */
function LineTable({ lines }: { lines: ReadonlyArray<Line> }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2rem_2.75rem_4rem_4.25rem] gap-x-2 gap-y-1.5 text-[13px] tabular-nums">
      <span className={cn(head, 'text-left')}>Group</span>
      <span className={head}>#</span>
      <span className={head}>Won</span>
      <span className={head}>Staked</span>
      <span className={head}>P&L</span>
      {lines.map((l) => (
        <Fragment key={l.label}>
          <span className="truncate">{l.label}</span>
          <span className="text-right text-muted">{l.count}</span>
          <span className="text-right">{pct(winRate(l))}</span>
          <span className="text-right text-muted">{usd(l.staked)}</span>
          <span className={cn('text-right font-semibold', tone(l.pnl))}>
            {signed(l.pnl)}
          </span>
        </Fragment>
      ))}
    </div>
  )
}

/** How often each kind of Leg hits, across singles' and Combos' Legs. */
function LegTable({ record: r }: { record: PredictionRecord }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_3rem] gap-x-2 gap-y-1.5 text-[13px] tabular-nums">
      <span className={cn(head, 'text-left')}>Leg</span>
      <span className={head}>Hit</span>
      <span className={head}>Miss</span>
      <span className={head}>Rate</span>
      {r.legs.byMarket.map((l) => (
        <Fragment key={l.label}>
          <span className="truncate">{l.label}</span>
          <span className="text-right">{l.won}</span>
          <span className="text-right text-muted">{l.lost}</span>
          <span className="text-right font-semibold">{pct(winRate(l))}</span>
        </Fragment>
      ))}
      <span className="font-semibold">All legs</span>
      <span className="text-right">{r.legs.won}</span>
      <span className="text-right text-muted">{r.legs.lost}</span>
      <span className="text-right font-semibold">{pct(winRate(r.legs))}</span>
      {r.nearMisses > 0 && (
        <span className="col-span-4 mt-1 text-xs text-muted">
          {r.nearMisses} lost {r.nearMisses === 1 ? 'combo' : 'combos'} missed
          by a single leg.
        </span>
      )}
    </div>
  )
}
