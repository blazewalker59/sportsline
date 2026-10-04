/**
 * Predictions (CONTEXT.md) in the Timeline: a strip of cards with each
 * Prediction's Odds moving like a score, and a sheet with its Legs.
 */

import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { PredictionGames } from './PredictionGames'
import type {
  ChangeDisplay,
  LegView,
  PredictionView,
} from '@/lib/kalshi/server'
import type { Progress } from '@/lib/kalshi/props'
import type { GameSummary } from '@/lib/model/timeline'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { Sheet } from '@/components/chat/Sheet'
import { CornerButton } from '@/components/timeline/GameStrip'
import { gameSearch } from '@/lib/timeline/gameLink'
import { cn } from '@/lib/utils'

export const pct = (n: number) => `${Math.round(n * 100)}%`
export const money = (n: number) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`

/** The change in a Prediction's Odds since the Viewer got in, in points. */
function movement(p: PredictionView): number | null {
  if (p.chance === null || p.entryChance === null) return null
  return Math.round((p.chance - p.entryChance) * 100)
}

/** What cashing out now would make or lose, in dollars and as a return. */
export function profitOf(
  p: Pick<PredictionView, 'value' | 'cost'>,
): { dollars: number; percent: number | null } | null {
  if (p.value === null) return null
  const dollars = p.value - p.cost
  return { dollars, percent: p.cost > 0 ? dollars / p.cost : null }
}

/** "+$3.40" / "−$1.10", or "+27%" / "−12%". */
export function profitText(
  profit: { dollars: number; percent: number | null },
  display: ChangeDisplay,
): string {
  if (display === 'percent' && profit.percent !== null) {
    const n = Math.round(profit.percent * 100)
    return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`
  }
  const sign = profit.dollars > 0.004 ? '+' : profit.dollars < -0.004 ? '−' : ''
  return `${sign}$${Math.abs(profit.dollars).toFixed(2)}`
}

const toneOf = (n: number) =>
  n > 0.004 ? 'text-scoring' : n < -0.004 ? 'text-live' : 'text-muted'

/** Odds over time as a line, with where the Viewer got in dashed. */
export function Sparkline({
  points,
  entry,
  width = 96,
  height = 28,
}: {
  points: ReadonlyArray<{ chance: number }>
  entry: number | null
  width?: number
  height?: number
}) {
  if (points.length < 2) return null
  const y = (c: number) => height - 2 - c * (height - 4)
  const step = width / (points.length - 1)
  const line = points
    .map((p, i) => `${(i * step).toFixed(1)},${y(p.chance).toFixed(1)}`)
    .join(' ')
  const up = points.at(-1)!.chance >= points[0].chance
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="overflow-visible"
    >
      {entry !== null && (
        <line
          x1="0"
          x2={width}
          y1={y(entry)}
          y2={y(entry)}
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeDasharray="3 3"
        />
      )}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        className={up ? 'text-scoring' : 'text-live'}
      />
    </svg>
  )
}

function LegDots({ legs }: { legs: ReadonlyArray<LegView> }) {
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {legs.map((l, i) => (
        <span
          key={i}
          className={cn(
            'size-1.5 rounded-full',
            l.status === 'won'
              ? 'bg-scoring'
              : l.status === 'lost'
                ? 'bg-live'
                : 'bg-muted/40',
          )}
        />
      ))}
    </span>
  )
}

/** The Game a Prediction (or its first Leg) is about, for its header. */
function leadGame(p: PredictionView): GameSummary | null {
  return p.legs.find((l) => l.game)?.game ?? null
}

/**
 * A stat prop's count against its line: "212 / 300 rec yds", filling as it
 * climbs, a check once the line is reached.
 */
export function PropProgress({
  progress,
  compact,
}: {
  progress: Progress
  compact?: boolean
}) {
  const hit = progress.current >= progress.target
  const share = Math.min(1, progress.current / Math.max(1, progress.target))
  return (
    <span className="flex flex-col gap-0.5">
      <span
        className={cn(
          'flex items-baseline justify-between gap-2 tabular-nums',
          compact ? 'text-[11px]' : 'text-xs',
        )}
      >
        <span className={cn('font-semibold', hit && 'text-scoring')}>
          {hit && '✓ '}
          {progress.current}
          <span className="font-normal text-muted">
            {' '}
            / {progress.target} {progress.label}
          </span>
        </span>
        {!hit && !compact && (
          <span className="text-muted">
            {progress.target - progress.current} to go
          </span>
        )}
      </span>
      <span
        className="h-1.5 overflow-hidden rounded-full bg-notice"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.target}
        aria-valuenow={progress.current}
        aria-label={`${progress.current} of ${progress.target} ${progress.label}`}
      >
        <span
          className={cn(
            'block h-full rounded-full transition-[width] duration-500',
            hit ? 'bg-scoring' : 'bg-accent',
          )}
          style={{ width: `${share * 100}%` }}
        />
      </span>
    </span>
  )
}

/** A Prediction as a small card: its Odds now, how they've moved, its Legs. */
export function PredictionCard({
  prediction: p,
  selected,
  onSelect,
  display = 'dollars',
}: {
  prediction: PredictionView
  selected?: boolean
  onSelect: () => void
  /** Profit or loss in dollars or percent return. */
  display?: ChangeDisplay
}) {
  const profit = profitOf(p)
  const progress = p.kind === 'single' ? (p.legs[0]?.progress ?? null) : null
  const move = movement(p)
  const game = leadGame(p)
  const won = p.legs.filter((l) => l.status === 'won').length
  const lost = p.legs.some((l) => l.status === 'lost')
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex h-full w-[176px] flex-col gap-1 rounded-2xl border bg-surface px-2.5 py-1.5 text-left transition-colors',
        selected
          ? 'border-accent bg-accent-soft'
          : lost
            ? 'border-live/40'
            : 'border-border',
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
        {p.kind === 'combo' ? (
          <>
            <span className="rounded bg-accent-soft px-1 text-accent">
              Combo
            </span>
            {won}/{p.legs.length}
            <LegDots legs={p.legs} />
          </>
        ) : game ? (
          <>
            <LeagueLogo league={game.league} size={14} />
            <TeamLogo team={game.awayTeam} size={14} />
            {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
          </>
        ) : (
          'Prediction'
        )}
      </span>
      <span className="line-clamp-2 min-h-[2.4em] text-[13px] leading-tight font-semibold">
        {p.side === 'no' && <span className="text-muted">Not: </span>}
        {p.title}
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className="flex flex-col">
          <span className="text-xl leading-none font-bold tabular-nums">
            {p.chance === null ? '—' : pct(p.chance)}
          </span>
          {profit ? (
            // At a glance: what cashing out now would make or lose.
            <span
              className={cn(
                'text-[11px] font-semibold tabular-nums',
                toneOf(profit.dollars),
              )}
            >
              {profit.dollars > 0.004
                ? '▲'
                : profit.dollars < -0.004
                  ? '▼'
                  : '·'}{' '}
              {profitText(profit, display)}
            </span>
          ) : (
            move !== null && (
              <span
                className={cn(
                  'text-[11px] font-semibold tabular-nums',
                  toneOf(move),
                )}
              >
                {move > 0 ? '▲' : move < 0 ? '▼' : '·'} {Math.abs(move)} from{' '}
                {pct(p.entryChance!)}
              </span>
            )
          )}
        </span>
        <Sparkline points={p.history} entry={p.entryChance} width={64} />
      </span>
      {/* Every card ends on a footer so the row's cards share a height:
          a prop's Progress, else what it pays. */}
      <span className="mt-auto pt-0.5">
        {progress ? (
          <PropProgress progress={progress} compact />
        ) : (
          <span className="flex h-[22px] items-center justify-between text-[11px] text-muted tabular-nums">
            <span>Pays {money(p.contracts)}</span>
            {p.kind === 'combo' && (
              <span>
                {won} of {p.legs.length} hit
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * Open Predictions as a strip of cards, like the score cards: tapping one
 * narrows the Timeline to it (tap again to clear), and the selected card's
 * corner badge opens its sheet.
 */
export function PredictionStrip({
  predictions,
  selected,
  onSelect,
  onDetails,
  display,
}: {
  predictions: ReadonlyArray<PredictionView>
  selected?: string
  onSelect: (id: string | null) => void
  onDetails: (id: string) => void
  display?: ChangeDisplay
}) {
  if (predictions.length === 0) return null
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-2 pt-2 pb-0.5" aria-label="Your Predictions">
        {predictions.map((p) => (
          <li key={p.id} className="relative flex shrink-0">
            <PredictionCard
              prediction={p}
              display={display}
              selected={p.id === selected}
              onSelect={() => onSelect(p.id === selected ? null : p.id)}
            />
            {p.id === selected && (
              <CornerButton
                label="Prediction details"
                onClick={() => onDetails(p.id)}
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </CornerButton>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function LegRow({ leg, onNavigate }: { leg: LegView; onNavigate: () => void }) {
  const g = leg.game
  return (
    <li className="flex flex-col gap-1 px-3 py-2.5">
      <span className="flex items-start gap-2">
        <span
          aria-label={leg.status}
          className={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
            leg.status === 'won'
              ? 'bg-scoring/15 text-scoring'
              : leg.status === 'lost'
                ? 'bg-live/15 text-live'
                : 'bg-notice text-muted',
          )}
        >
          {leg.status === 'won' ? '✓' : leg.status === 'lost' ? '✕' : '·'}
        </span>
        <span className="min-w-0 flex-1 text-sm leading-snug font-medium">
          {leg.side === 'no' && <span className="text-muted">Not: </span>}
          {leg.playerId ? (
            <Link
              to="/players/$playerId"
              params={{ playerId: leg.playerId }}
              onClick={onNavigate}
              className="underline-offset-2 hover:underline"
            >
              {leg.title}
            </Link>
          ) : (
            leg.title
          )}
        </span>
        {leg.status === 'pending' && leg.chance !== null && (
          <span className="text-sm font-bold tabular-nums">
            {pct(leg.chance)}
          </span>
        )}
      </span>
      {leg.progress && (
        <span className="ml-7">
          <PropProgress progress={leg.progress} />
        </span>
      )}
      {g && (
        <Link
          to="/"
          search={gameSearch(g.id, g.sportsDay)}
          onClick={onNavigate}
          className="ml-7 flex items-center gap-1.5 self-start rounded-full bg-notice px-2 py-0.5 text-xs text-muted hover:text-foreground"
        >
          <LeagueLogo league={g.league} size={12} />
          <TeamLogo team={g.awayTeam} size={14} />
          <span className="tabular-nums">
            {g.awayTeam.abbreviation}
            {g.status !== 'scheduled' && ` ${g.score.away}`} –{' '}
            {g.status !== 'scheduled' && `${g.score.home} `}
            {g.homeTeam.abbreviation}
          </span>
          <TeamLogo team={g.homeTeam} size={14} />
          <span>
            ·{' '}
            {g.status === 'live' || g.status === 'delayed'
              ? (g.situation?.segmentLabel ?? 'Live')
              : g.status === 'final'
                ? 'Final'
                : new Date(g.startsAt).toLocaleString([], {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
          </span>
        </Link>
      )}
    </li>
  )
}

/** A Prediction in full: Odds, money, and every Leg with its Game. */
export function PredictionSheet({
  prediction: p,
  onClose,
}: {
  prediction: PredictionView
  onClose: () => void
}) {
  const move = movement(p)
  const settled = p.status !== 'open'
  return (
    <Sheet
      title={p.kind === 'combo' ? 'Combo' : 'Prediction'}
      onClose={onClose}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-lg leading-snug font-bold">
          {p.side === 'no' && <span className="text-muted">Not: </span>}
          {p.title}
        </h2>
        {settled ? (
          <span
            className={cn(
              'text-sm font-semibold',
              p.result === 'won' ? 'text-scoring' : 'text-muted',
            )}
          >
            {p.status === 'closed'
              ? 'Closed out'
              : p.result === 'won'
                ? 'Won'
                : p.result === 'lost'
                  ? 'Lost'
                  : 'Voided'}
            {p.pnl !== null && ` · ${p.pnl >= 0 ? '+' : ''}${money(p.pnl)}`}
          </span>
        ) : (
          <span className="flex items-end justify-between gap-3">
            <span className="flex flex-col">
              <span className="text-3xl leading-none font-bold tabular-nums">
                {p.chance === null ? '—' : pct(p.chance)}
              </span>
              {move !== null && (
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    move > 0
                      ? 'text-scoring'
                      : move < 0
                        ? 'text-live'
                        : 'text-muted',
                  )}
                >
                  {move > 0 ? '▲' : move < 0 ? '▼' : '·'} {Math.abs(move)} pts
                  from {pct(p.entryChance!)} when you got in
                </span>
              )}
            </span>
            <Sparkline
              points={p.history}
              entry={p.entryChance}
              width={120}
              height={40}
            />
          </span>
        )}
      </header>
      <dl className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface p-3 text-center text-xs text-muted">
        <div>
          <dt>Contracts</dt>
          <dd className="text-base font-semibold text-foreground tabular-nums">
            {Number.isInteger(p.contracts)
              ? p.contracts
              : p.contracts.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd className="text-base font-semibold text-foreground tabular-nums">
            {money(p.cost)}
          </dd>
        </div>
        <div>
          <dt>{settled ? 'Payout' : 'Cash out now'}</dt>
          <dd className="text-base font-semibold text-foreground tabular-nums">
            {settled
              ? p.payout === null
                ? '—'
                : money(p.payout)
              : p.value === null
                ? '—'
                : money(p.value)}
            {!settled &&
              (() => {
                const profit = profitOf(p)
                return profit ? (
                  <span
                    className={cn(
                      'block text-[11px] font-semibold',
                      toneOf(profit.dollars),
                    )}
                  >
                    {profitText(profit, 'dollars')}
                    {profit.percent !== null &&
                      ` (${profitText(profit, 'percent')})`}
                  </span>
                ) : null
              })()}
          </dd>
        </div>
      </dl>
      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
          {p.kind === 'combo' ? `${p.legs.length} legs` : 'Market'}
        </h3>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {p.legs.map((leg, i) => (
            <LegRow key={i} leg={leg} onNavigate={onClose} />
          ))}
        </ul>
      </section>
      <PredictionGames prediction={p} onNavigate={onClose} />
      <p className="text-[11px] text-muted">
        Read from your Kalshi account. Odds are Kalshi’s market prices.
      </p>
    </Sheet>
  )
}

/**
 * Open Predictions at a glance, across the strip's width: how many, what's
 * staked, and what cashing everything out now would bring. Tapping it opens
 * the portfolio, every open Prediction with its status and payout.
 */
export function PredictionSummary({
  predictions,
  display = 'dollars',
  onOpen,
}: {
  predictions: ReadonlyArray<PredictionView>
  display?: ChangeDisplay
  /** Open one Prediction's sheet (from the portfolio). */
  onOpen?: (id: string) => void
}) {
  const [portfolioOpen, setPortfolioOpen] = useState(false)
  const open = predictions.filter((p) => p.status === 'open')
  if (open.length === 0) return null
  const totals = portfolioTotals(open)
  return (
    <>
      <button
        type="button"
        onClick={() => setPortfolioOpen(true)}
        aria-label="Your portfolio"
        className="mt-2 flex w-full items-stretch divide-x divide-border rounded-2xl border border-border bg-surface text-center transition-colors hover:border-accent/50"
      >
        <span className="flex flex-1 flex-col justify-center px-2 py-1.5">
          <span className="text-[11px] text-muted">Open</span>
          <span className="text-[15px] font-bold tabular-nums">
            {open.length}
          </span>
        </span>
        <span className="flex flex-1 flex-col justify-center px-2 py-1.5">
          <span className="text-[11px] text-muted">Staked</span>
          <span className="text-[15px] font-bold tabular-nums">
            {money(totals.staked)}
          </span>
        </span>
        <span className="flex flex-[1.4] flex-col justify-center px-2 py-1.5">
          <span className="text-[11px] text-muted">Cash out now ›</span>
          <span className="text-[15px] font-bold tabular-nums">
            {totals.profit ? money(totals.cashout) : '—'}
            {totals.profit && (
              <span
                className={cn(
                  'ml-1 text-xs font-semibold',
                  toneOf(totals.profit.dollars),
                )}
              >
                {profitText(totals.profit, display)}
              </span>
            )}
          </span>
        </span>
      </button>
      {portfolioOpen && (
        <PortfolioSheet
          predictions={open}
          display={display}
          onClose={() => setPortfolioOpen(false)}
          onOpen={
            onOpen
              ? (id) => {
                  setPortfolioOpen(false)
                  onOpen(id)
                }
              : undefined
          }
        />
      )}
    </>
  )
}

function portfolioTotals(open: ReadonlyArray<PredictionView>) {
  const staked = open.reduce((n, p) => n + p.cost, 0)
  const priced = open.filter((p) => p.value !== null)
  const cashout = priced.reduce((n, p) => n + (p.value ?? 0), 0)
  return {
    staked,
    cashout,
    /** A winning contract pays $1. */
    payout: open.reduce((n, p) => n + p.contracts, 0),
    profit:
      priced.length > 0
        ? profitOf({
            value: cashout,
            cost: priced.reduce((n, p) => n + p.cost, 0),
          })
        : null,
  }
}

/** Every open Prediction with its status and payout, and the totals. */
function PortfolioSheet({
  predictions,
  display,
  onClose,
  onOpen,
}: {
  predictions: ReadonlyArray<PredictionView>
  display: ChangeDisplay
  onClose: () => void
  onOpen?: (id: string) => void
}) {
  const totals = portfolioTotals(predictions)
  return (
    <Sheet title="Portfolio" onClose={onClose}>
      <dl className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface p-3 text-center text-xs text-muted">
        <div>
          <dt>Staked</dt>
          <dd className="text-base font-semibold text-foreground tabular-nums">
            {money(totals.staked)}
          </dd>
        </div>
        <div>
          <dt>Cash out now</dt>
          <dd className="text-base font-semibold text-foreground tabular-nums">
            {totals.profit ? money(totals.cashout) : '—'}
            {totals.profit && (
              <span
                className={cn(
                  'block text-[11px] font-semibold',
                  toneOf(totals.profit.dollars),
                )}
              >
                {profitText(totals.profit, display)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>If all win</dt>
          <dd className="text-base font-semibold text-foreground tabular-nums">
            {money(totals.payout)}
          </dd>
        </div>
      </dl>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {predictions.map((p) => {
          const profit = profitOf(p)
          const won = p.legs.filter((l) => l.status === 'won').length
          const lost = p.legs.some((l) => l.status === 'lost')
          const progress =
            p.kind === 'single' ? (p.legs[0]?.progress ?? null) : null
          const row = (
            <span className="flex w-full items-start gap-3 px-3 py-2.5 text-left">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-sm leading-snug font-semibold">
                  {p.side === 'no' && <span className="text-muted">Not: </span>}
                  {p.title}
                </span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted tabular-nums">
                  {p.kind === 'combo' && (
                    <span className={cn(lost && 'text-live')}>
                      {lost ? 'Busted · ' : ''}
                      {won}/{p.legs.length} legs ·
                    </span>
                  )}
                  <span>{money(p.cost)} in</span>
                  <span>· pays {money(p.contracts)}</span>
                </span>
                {progress && <PropProgress progress={progress} compact />}
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-base leading-tight font-bold tabular-nums">
                  {p.chance === null ? '—' : pct(p.chance)}
                </span>
                <span className="text-xs tabular-nums">
                  {p.value === null ? '—' : money(p.value)}
                </span>
                {profit && (
                  <span
                    className={cn(
                      'text-[11px] font-semibold tabular-nums',
                      toneOf(profit.dollars),
                    )}
                  >
                    {profitText(profit, display)}
                  </span>
                )}
              </span>
            </span>
          )
          return (
            <li key={p.id}>
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="w-full"
                >
                  {row}
                </button>
              ) : (
                row
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] text-muted">
        Cash out is what selling now would bring at Kalshi’s current prices; a
        winning contract pays $1.
      </p>
    </Sheet>
  )
}
