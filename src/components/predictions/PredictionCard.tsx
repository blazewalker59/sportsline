/**
 * Predictions (CONTEXT.md) in the Timeline: a strip of cards with each
 * Prediction's Odds moving like a score.
 */

import {
  LegDots,
  PropProgress,
  Sparkline,
  leadGame,
  money,
  movement,
  pct,
  profitOf,
  profitText,
  toneOf,
} from './PredictionParts'
import type { ChangeDisplay, PredictionView } from '@/lib/kalshi/server'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { CornerButton } from '@/components/timeline/GameStrip'
import { cn } from '@/lib/utils'

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
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px] font-semibold whitespace-nowrap text-muted">
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
