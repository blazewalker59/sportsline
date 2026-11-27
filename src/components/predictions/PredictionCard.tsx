/**
 * A Prediction (CONTEXT.md) as a small card, its Odds moving like a
 * score (a Player's page lists them).
 */

import {
  LegDots,
  PropProgress,
  Sparkline,
  arrowOf,
  isLivePrediction,
  leadGame,
  money,
  movement,
  pct,
  profitOf,
  profitText,
  toneOf,
} from './PredictionParts'
import type { ChangeDisplay } from '@/lib/kalshi/server'
import type { PredictionView } from '@/lib/kalshi/predictionViews'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { Meter } from '@/components/signal/Meter'
import { cn } from '@/lib/utils'

/** A Prediction as a small card: its Odds now as a meter, how they've moved, its Legs. */
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
  const live = isLivePrediction(p)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex h-full w-[176px] flex-col gap-1.5 rounded-card bg-surface px-3 py-2.5 text-left',
        selected && 'ring-2 ring-foreground',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-3xs whitespace-nowrap text-muted uppercase">
        {p.kind === 'combo' ? (
          <>
            <span className="font-bold text-foreground/80">Combo</span>
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
        {live && (
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <span className="led led-pulse" />
            <span className="sr-only">Live</span>
          </span>
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
                'text-2xs font-semibold whitespace-nowrap tabular-nums',
                toneOf(profit.dollars),
              )}
            >
              {arrowOf(profit.dollars)} {profitText(profit, display)}
            </span>
          ) : (
            move !== null && (
              <span className="text-2xs whitespace-nowrap text-muted tabular-nums">
                {move > 0 ? '▲' : move < 0 ? '▼' : '·'} {Math.abs(move)} from{' '}
                {pct(p.entryChance!)}
              </span>
            )
          )}
        </span>
        <Sparkline
          points={p.history}
          entry={p.entryChance}
          width={64}
          live={live}
        />
      </span>
      {p.chance !== null && (
        <Meter
          value={p.chance}
          segments={16}
          thin
          label={`Odds ${pct(p.chance)}`}
        />
      )}
      {/* Every card ends on a footer so the row's cards share a height:
          a prop's Progress, else what it pays. */}
      <span className="mt-auto">
        {progress ? (
          <PropProgress progress={progress} compact />
        ) : (
          <span className="flex items-center justify-between text-3xs text-muted uppercase tabular-nums">
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
