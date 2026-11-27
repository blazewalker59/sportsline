/**
 * A Prediction in full (CONTEXT.md): its Odds, money, and every Leg. A
 * sheet, or beside the wide Timeline its pane (same content, another frame).
 */

import { Link } from '@tanstack/react-router'
import {
  PropProgress,
  isLivePrediction,
  legGlyph,
  money,
  movement,
  pct,
  profitOf,
  profitText,
  toneOf,
} from './PredictionParts'
import { PredictionGames } from './PredictionGames'
import type { LegView, PredictionView } from '@/lib/kalshi/predictionViews'
import type { SheetFrame } from '@/components/chat/Sheet'
import { OddsChart } from '@/components/charts/lazy'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { Sheet } from '@/components/chat/Sheet'
import { TeamPip } from '@/components/brand/TeamPip'
import { isPair } from '@/lib/brand/subject'
import { legTeam, predictionSubject } from '@/lib/kalshi/legTeam'
import { gameSearch } from '@/lib/timeline/gameLink'
import { PlayerButton } from '@/components/players/playerSheet'
import { Meter } from '@/components/signal/Meter'
import { Num } from '@/components/signal/Num'
import { SectionLabel } from '@/components/signal/Section'
import { isLiveGame } from '@/lib/timeline/stakes'
import { cn } from '@/lib/utils'
import { weekdayTime } from '@/lib/time/format'
import { useTimeZone } from '@/lib/time/useTimeZone'

/** A fact's value under its label: back in the reading face. */
const DD =
  'mt-0.5 font-sans text-base font-semibold tracking-normal text-foreground normal-case tabular-nums'

function LegRow({
  leg,
  index,
  pip,
  onNavigate,
}: {
  leg: LegView
  /** Its place in a Combo (1-based), or null for a single's market. */
  index: number | null
  /** Its own team's pip (when the sheet isn't one team's). */
  pip: boolean
  onNavigate: () => void
}) {
  const g = leg.game
  const timeZone = useTimeZone()
  const live = g !== null && isLiveGame(g)
  return (
    <li className="flex flex-col gap-2.5 rounded-card bg-surface p-4">
      <span className="flex items-center justify-between gap-2 text-3xs text-muted uppercase">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {live && <span className="led led-pulse" aria-hidden="true" />}
          {index !== null && `Leg ${index}`}
          {leg.status === 'pending' && leg.chance !== null && (
            <span>
              {index !== null && '· '}Odds {pct(leg.chance)}
            </span>
          )}
        </span>
        <span
          aria-label={leg.status}
          className={cn(
            'text-xs',
            leg.status === 'lost' ? 'text-muted' : 'text-foreground',
          )}
        >
          {legGlyph(leg.status)}
        </span>
      </span>
      <span className="flex items-start gap-2">
        {pip && (
          <TeamPip colors={legTeam(leg)?.colors} className="mt-1 h-3.5 w-1" />
        )}
        <span
          className={cn(
            'min-w-0 flex-1 text-[15px] leading-snug font-semibold',
            leg.status === 'lost' && 'text-muted line-through',
          )}
        >
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
      </span>
      {leg.progress ? (
        <PropProgress progress={leg.progress} />
      ) : (
        leg.status === 'pending' &&
        leg.chance !== null && (
          <Meter
            value={leg.chance}
            segments={20}
            thin
            label={`Odds ${pct(leg.chance)}`}
          />
        )
      )}
      {g && (
        <Link
          to="/"
          search={gameSearch(g.id, g.sportsDay)}
          onClick={onNavigate}
          className="well flex items-center gap-1.5 self-start rounded-control px-2 py-1 text-xs text-muted hover:text-foreground"
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
          <span className={cn(live && 'font-semibold text-live')}>
            ·{' '}
            {live
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

/** A Prediction in full, as a bottom sheet (PredictionDetail). */
export function PredictionSheet({
  prediction,
  onClose,
  onNavigate = onClose,
}: {
  prediction: PredictionView
  onClose: () => void
  /** A link inside it was followed (by default, it closes). */
  onNavigate?: () => void
}) {
  return (
    <PredictionDetail
      prediction={prediction}
      onNavigate={onNavigate}
      frame={(parts) => <Sheet {...parts} onClose={onClose} />}
    />
  )
}

/**
 * A Prediction in full: Odds, money, and every Leg with its Game. It
 * wears its team's color (the Player's, the team picked, or a combo's on
 * one team), or both teams' when it's on one Game (a total, a same-game
 * combo); otherwise each Leg shows its own team. `frame` lays it out: a
 * Sheet, or the wide Timeline's pane.
 */
export function PredictionDetail({
  prediction: p,
  onNavigate,
  frame,
}: {
  prediction: PredictionView
  /** A link inside it was followed (a sheet closes; a pane is replaced). */
  onNavigate: () => void
  frame: SheetFrame
}) {
  const move = movement(p)
  const settled = p.status !== 'open'
  const combo = p.kind === 'combo'
  const subject = predictionSubject(p.legs)
  // Each Leg's own team, unless the whole sheet is one team's.
  const pips = !subject || isPair(subject)
  const live = isLivePrediction(p)
  return frame({
    title: combo ? 'Combo' : 'Prediction',
    subject,
    children: (
      <>
        <header className="flex flex-col gap-2 rounded-card bg-surface p-4">
          <span className="flex items-center gap-2 text-3xs text-muted uppercase">
            {live && <span className="led led-pulse" aria-hidden="true" />}
            {combo ? `${p.legs.length} legs · ` : ''}
            {money(p.cost)} to win {money(p.contracts)}
          </span>
          <h2 className="text-lg leading-snug font-bold">
            {p.side === 'no' && <span className="text-muted">Not: </span>}
            {p.title}
          </h2>
          {settled ? (
            <span className="text-sm font-semibold">
              <span className="mr-1" aria-hidden="true">
                {p.result === 'won' ? '●' : '○'}
              </span>
              {p.status === 'closed'
                ? 'Closed out'
                : p.result === 'won'
                  ? 'Won'
                  : p.result === 'lost'
                    ? 'Lost'
                    : 'Voided'}
              {p.pnl !== null && (
                <span className={toneOf(p.pnl)}>
                  {` · ${p.pnl >= 0 ? '+' : ''}${money(p.pnl)}`}
                </span>
              )}
            </span>
          ) : (
            <span className="flex items-end justify-between gap-3">
              <Num
                unit={p.chance === null ? undefined : '%'}
                className="text-[76px]"
              >
                {p.chance === null ? '—' : Math.round(p.chance * 100)}
              </Num>
              <span className="pb-1 text-right text-3xs text-muted uppercase">
                Odds now
                {move !== null && (
                  <span className="block tabular-nums">
                    {move > 0 ? '▲' : move < 0 ? '▼' : '·'} {Math.abs(move)} pts
                    from {pct(p.entryChance!)}
                    <span className="block">when you got in</span>
                  </span>
                )}
              </span>
            </span>
          )}
        </header>
        <OddsChart predictionId={p.id} />
        <dl className="grid grid-cols-3 gap-2 rounded-card bg-surface p-4 text-3xs text-muted uppercase">
          <div>
            <dt className="subject-ink">Contracts</dt>
            <dd className={DD}>
              {Number.isInteger(p.contracts)
                ? p.contracts
                : p.contracts.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="subject-ink">Cost</dt>
            <dd className={DD}>{money(p.cost)}</dd>
          </div>
          <div>
            <dt className="subject-ink">
              {settled ? 'Payout' : 'Cash out now'}
            </dt>
            <dd className={DD}>
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
                        'block text-2xs font-semibold',
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
          <SectionLabel
            as="h3"
            title={combo ? `${p.legs.length} legs` : 'Market'}
          >
            {combo &&
              `${p.legs.filter((l) => l.status !== 'pending').length} of ${p.legs.length} settled`}
          </SectionLabel>
          <ul className="flex flex-col gap-2">
            {p.legs.map((leg, i) => (
              <LegRow
                key={i}
                leg={leg}
                index={combo ? i + 1 : null}
                pip={pips}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </section>
        <PredictionGames prediction={p} onNavigate={onNavigate} />
        <p className="text-2xs text-muted">
          Read from your Kalshi account. Odds are Kalshi’s market prices.
        </p>
      </>
    ),
  })
}
