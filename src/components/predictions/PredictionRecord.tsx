/**
 * The Viewer's Record (CONTEXT.md): volume and results over a range (7
 * days by default; 30 days, all time, or a custom range), the trend, the
 * patterns worth noticing, and where they win and lose.
 */

import { Fragment, useMemo, useState } from 'react'
import type {
  Calibration,
  Line,
  PredictionRecord,
  Range,
} from '@/lib/kalshi/record'
import { Segmented } from '@/components/signal/Segmented'
import { CalibrationChart, RecordTrend } from '@/components/charts/lazy'
import { buildRecord, calibrationOf, winRate } from '@/lib/kalshi/record'
import { usePredictionRecord } from '@/lib/kalshi/usePredictions'
import { useStoredValue } from '@/lib/useStoredValue'
import { StatGrid, StatTile } from '@/components/layout/StatTile'
import { InlineError } from '@/components/layout/RouteStates'
import { CardSkeleton } from '@/components/layout/Skeleton'
import { SectionLabel } from '@/components/signal/Section'
import { cn } from '@/lib/utils'
import { dayOf, formatNumber, shiftDay, startOfDay } from '@/lib/time/format'
import { useTimeZone } from '@/lib/time/useTimeZone'

type RangeKey = '7d' | '30d' | 'all' | 'custom'
const RANGE_KEY = 'sportsline:recordRange'

const usd = (n: number) =>
  `$${formatNumber(Math.abs(n), {
    minimumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  })}`
const signed = (n: number) =>
  `${n > 0.004 ? '+' : n < -0.004 ? '−' : ''}${usd(n)}`
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)
const tone = (n: number) =>
  n > 0.004 ? 'text-positive' : n < -0.004 ? 'text-negative' : 'text-muted'

const RANGES: ReadonlyArray<readonly [RangeKey, string]> = [
  ['7d', '7D'],
  ['30d', '30D'],
  ['all', 'All'],
  ['custom', 'Custom'],
]

const parseRange = (v: string | null): RangeKey =>
  v === '30d' || v === 'all' || v === 'custom' ? v : '7d'

export function PredictionRecordSection() {
  const history = usePredictionRecord()
  // The remembered range loads after the first render (it's on the device,
  // so the server can't render it).
  const [stored, setStored] = useStoredValue(RANGE_KEY)
  const key = parseRange(stored)
  // Days are the Viewer's. Until the zone is known (a first visit, while
  // hydrating) UTC's, the same on the server and the client.
  const timeZone = useTimeZone() ?? 'UTC'
  // The last two weeks until the Viewer picks. Custom shows only once the
  // remembered range has loaded, so this never reaches the server's HTML.
  const [picked, setPicked] = useState<{ from: string; to: string } | null>(
    null,
  )
  const custom = picked ?? {
    from: shiftDay(dayOf(Date.now(), timeZone), -13),
    to: dayOf(Date.now(), timeZone),
  }
  const choose = (k: RangeKey) => setStored(k)
  const range = useMemo((): Range => {
    const now = Date.now()
    if (key === '7d') return { from: new Date(now - 7 * 86_400_000), to: null }
    if (key === '30d')
      return { from: new Date(now - 30 * 86_400_000), to: null }
    if (key === 'custom')
      return {
        from: startOfDay(custom.from, timeZone),
        to: startOfDay(shiftDay(custom.to, 1), timeZone),
      }
    return { from: null, to: null }
  }, [key, custom.from, custom.to, timeZone])
  const record = useMemo(
    () => (history.data ? buildRecord(history.data, range, timeZone) : null),
    [history.data, range, timeZone],
  )
  const calibration = useMemo(
    () => (history.data ? calibrationOf(history.data, range) : null),
    [history.data, range],
  )

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel title="Your record" index="E3" className="mb-0" />
      <Segmented
        fill
        label="Range"
        value={key}
        options={RANGES}
        onChange={choose}
      />
      {key === 'custom' && (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            aria-label="From"
            value={custom.from}
            max={custom.to}
            onChange={(e) =>
              e.target.value && setPicked({ ...custom, from: e.target.value })
            }
            className="well min-w-0 flex-1 rounded-control px-2 py-1.5"
          />
          <span className="text-muted">to</span>
          <input
            type="date"
            aria-label="To"
            value={custom.to}
            min={custom.from}
            onChange={(e) =>
              e.target.value && setPicked({ ...custom, to: e.target.value })
            }
            className="well min-w-0 flex-1 rounded-control px-2 py-1.5"
          />
        </div>
      )}
      {history.isPending ? (
        <CardSkeleton label="Loading your record" />
      ) : history.isError && history.data === undefined ? (
        <InlineError
          what="your record"
          error={history.error}
          onRetry={() => history.refetch()}
        />
      ) : !record || record.totals.count === 0 ? (
        <p className="well rounded-card px-4 py-5 text-center text-sm text-muted">
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
      <StatGrid>
        <StatTile label="Volume" value={usd(t.staked)} />
        <StatTile
          label="Predictions"
          value={String(t.count)}
          sub={t.open > 0 ? `${t.open} open` : undefined}
        />
        <StatTile
          label="Net P&L"
          value={signed(t.pnl)}
          className={tone(t.pnl)}
          sub={t.settled > 0 ? `${t.settled} settled` : 'none settled'}
        />
        <StatTile
          label="Win rate"
          value={pct(winRate(t))}
          sub={`${t.won}–${t.lost}`}
        />
        <StatTile
          label="Return"
          value={pct(t.roi)}
          className={t.roi === null ? undefined : tone(t.roi)}
          sub="on settled"
        />
        <StatTile label="Avg stake" value={usd(t.avgStake)} />
      </StatGrid>

      {r.days.length > 1 && <RecordTrend days={r.days} />}

      {calibration && calibration.count > 0 && (
        <CalibrationChart calibration={calibration} />
      )}

      {r.insights.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-card bg-surface px-4 py-3">
          {r.insights.map((i) => (
            <li key={i.text} className="flex items-start gap-2 text-[13px]">
              <span
                aria-hidden="true"
                className={cn(
                  'w-3 shrink-0 text-center text-xs',
                  i.tone === 'good'
                    ? 'text-positive'
                    : i.tone === 'bad'
                      ? 'text-negative'
                      : 'text-muted',
                )}
              >
                {i.tone === 'good' ? '▲' : i.tone === 'bad' ? '▼' : '◐'}
              </span>
              {i.text}
            </li>
          ))}
        </ul>
      )}

      <Breakdowns record={r} />

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-3xs text-muted uppercase tabular-nums">
        {r.streak && (
          <span>
            Streak:{' '}
            <span
              className={cn(
                'font-semibold',
                r.streak.kind === 'won' ? 'text-positive' : 'text-negative',
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
            Best: <span className="text-positive">{signed(t.best.pnl!)}</span>
          </span>
        )}
        {t.worst && (
          <span>
            Worst: <span className="text-negative">{signed(t.worst.pnl!)}</span>
          </span>
        )}
        {t.open > 0 && <span>Open stake: {usd(t.openStaked)}</span>}
      </p>
    </>
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
    <div className="rounded-card bg-surface p-3">
      <div
        role="tablist"
        className="well mb-3 flex gap-1 overflow-x-auto rounded-control p-1"
      >
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
                'min-h-8 flex-1 rounded-[8px] px-2 text-3xs font-bold whitespace-nowrap uppercase',
                tab === k
                  ? 'key key-pressed text-foreground'
                  : 'text-muted hover:text-foreground',
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

const head = 'text-right text-3xs text-muted uppercase'

/** Each group's count, win rate, stake and P&L, aligned like a table. */
function LineTable({ lines }: { lines: ReadonlyArray<Line> }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2rem_2.75rem_4rem_4.25rem] gap-x-2 gap-y-2 text-[13px] tabular-nums">
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
