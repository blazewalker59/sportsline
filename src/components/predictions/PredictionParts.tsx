/**
 * Predictions (CONTEXT.md) in the Timeline: a strip of cards with each
 * Prediction's Odds moving like a score, and a sheet with its Legs.
 */

import { Link } from '@tanstack/react-router'
import type { LegView, PredictionView } from '@/lib/kalshi/server'
import type { Progress } from '@/lib/kalshi/props'
import type { GameSummary } from '@/lib/model/timeline'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { Sheet } from '@/components/chat/Sheet'
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
}: {
  prediction: PredictionView
  selected?: boolean
  onSelect: () => void
}) {
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
        'flex w-[176px] flex-col gap-1 rounded-2xl border bg-surface px-2.5 py-1.5 text-left transition-colors',
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
          {move !== null && (
            <span
              className={cn(
                'text-[11px] font-semibold tabular-nums',
                move > 0
                  ? 'text-scoring'
                  : move < 0
                    ? 'text-live'
                    : 'text-muted',
              )}
            >
              {move > 0 ? '▲' : move < 0 ? '▼' : '·'} {Math.abs(move)} from{' '}
              {pct(p.entryChance!)}
            </span>
          )}
        </span>
        <Sparkline points={p.history} entry={p.entryChance} width={64} />
      </span>
      {progress && <PropProgress progress={progress} compact />}
    </button>
  )
}

/**
 * Open Predictions as a strip of cards, like the score cards: tapping one
 * narrows the Timeline to it (tap again to clear), and its Details button
 * opens the sheet.
 */
export function PredictionStrip({
  predictions,
  selected,
  onSelect,
  onDetails,
}: {
  predictions: ReadonlyArray<PredictionView>
  selected?: string
  onSelect: (id: string | null) => void
  onDetails: (id: string) => void
}) {
  if (predictions.length === 0) return null
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-2 pt-1.5 pb-0.5" aria-label="Your Predictions">
        {predictions.map((p) => (
          <li key={p.id} className="flex shrink-0 gap-1.5">
            <PredictionCard
              prediction={p}
              selected={p.id === selected}
              onSelect={() => onSelect(p.id === selected ? null : p.id)}
            />
            <button
              type="button"
              onClick={() => onDetails(p.id)}
              aria-label="Prediction details"
              className={cn(
                'flex w-12 flex-col items-center justify-center gap-0.5 rounded-2xl bg-notice text-[10px] font-semibold text-muted hover:text-foreground',
                p.id === selected
                  ? 'animate-in fade-in zoom-in-95 duration-200'
                  : 'hidden',
              )}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
              Details
            </button>
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
          <dt>{settled ? 'Payout' : 'Worth now'}</dt>
          <dd className="text-base font-semibold text-foreground tabular-nums">
            {settled
              ? p.payout === null
                ? '—'
                : money(p.payout)
              : p.value === null
                ? '—'
                : money(p.value)}
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
      <p className="text-[11px] text-muted">
        Read from your Kalshi account. Odds are Kalshi’s market prices.
      </p>
    </Sheet>
  )
}
