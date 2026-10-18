/** A Prediction's sheet (CONTEXT.md): its Odds, money, and every Leg. */

import { Link } from '@tanstack/react-router'
import {
  PropProgress,
  money,
  movement,
  pct,
  profitOf,
  profitText,
  toneOf,
} from './PredictionParts'
import { PredictionGames } from './PredictionGames'
import type { LegView, PredictionView } from '@/lib/kalshi/server'
import { OddsChart } from '@/components/charts/lazy'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { Sheet } from '@/components/chat/Sheet'
import { gameSearch } from '@/lib/timeline/gameLink'
import { PlayerButton } from '@/components/players/playerSheet'
import { cn } from '@/lib/utils'
import { weekdayTime } from '@/lib/time/format'
import { useTimeZone } from '@/lib/time/useTimeZone'

function LegRow({ leg, onNavigate }: { leg: LegView; onNavigate: () => void }) {
  const g = leg.game
  const timeZone = useTimeZone()
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
            <PlayerButton
              playerId={leg.playerId}
              className="underline-offset-2 hover:underline"
            >
              {leg.title}
            </PlayerButton>
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
                : weekdayTime(g.startsAt, timeZone)}
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
          </span>
        )}
      </header>
      <OddsChart predictionId={p.id} />
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
