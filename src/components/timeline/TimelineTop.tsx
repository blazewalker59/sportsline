/**
 * The Timeline's pinned top: the header (day, Highlights, connection) with
 * the day strip under it, then the Scope chips and the cards for the Scope:
 * Fantasy Matchups, Predictions, or the day's Games. Pinned over the content
 * rather than in its flow: hiding the cards slides them up behind the
 * header without changing the page's height, so scrolling never feeds back
 * into the hide/show.
 */

import { DayButton } from './DayButton'
import { DayStrip } from './DayStrip'
import { ScopeBar } from './ScopeBar'
import { GameStrip } from './GameStrip'
import { Collapse, ConnectionDot, HighlightsButton } from './TimelineControls'
import { inScope } from './timelineScope'
import type { TimelineScopeState } from './useTimelineScope'
import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import type { Connection } from '@/lib/timeline/useLiveTimeline'
import { FantasyStrip } from '@/components/fantasy/FantasyParts'
import {
  PredictionStrip,
  PredictionSummary,
} from '@/components/predictions/PredictionParts'
import { SharpPicksBanner } from '@/components/predictions/SharpPicks'
import { AppHeader } from '@/components/layout/AppHeader'
import { withViewTransition } from '@/lib/viewTransition'
import { cn } from '@/lib/utils'

export function TimelineTop({
  topRef,
  scope: s,
  sportsDay,
  today,
  gameId,
  dayOpen,
  onDayToggle,
  onDayClose,
  panelHidden,
  highlights,
  onHighlights,
  connection,
  dimmed,
  games,
  previousGames,
  items,
  onBox,
  onPrediction,
  onMatchup,
}: {
  topRef: React.Ref<HTMLDivElement>
  scope: TimelineScopeState
  sportsDay: string
  today: string
  gameId: string | null
  dayOpen: boolean
  onDayToggle: () => void
  onDayClose: () => void
  /** The Scope chips and cards are tucked away (reading down). */
  panelHidden: boolean
  highlights: boolean
  onHighlights: (on: boolean) => void
  connection: Connection
  /** A day is loading: the previous day's cards stay, dimmed. */
  dimmed: boolean
  games: Array<GameSummary>
  previousGames: Array<GameSummary>
  items: ReadonlyArray<TimelineItem>
  onBox: () => void
  onPrediction: (id: string) => void
  onMatchup: (id: string) => void
}) {
  const display = s.kalshi.data?.changeDisplay
  return (
    <div
      ref={topRef}
      className="pointer-events-none fixed inset-x-0 top-0 z-10"
      style={{ viewTransitionName: 'pinned' }}
    >
      <div className="mx-auto max-w-xl">
        <div
          className={cn(
            'pointer-events-auto relative z-20 bg-background px-4 transition-[border-color]',
            'border-b',
            panelHidden ? 'border-border' : 'border-transparent',
          )}
        >
          <AppHeader
            pinned={false}
            title={
              <DayButton
                sportsDay={sportsDay}
                today={today}
                open={dayOpen}
                onToggle={onDayToggle}
              />
            }
            right={
              <HighlightsButton
                on={highlights}
                onChange={(value) =>
                  withViewTransition(() => onHighlights(value))
                }
              />
            }
          >
            <ConnectionDot connection={connection} />
          </AppHeader>
          <Collapse open={dayOpen}>
            <DayStrip sportsDay={sportsDay} today={today} onPick={onDayClose} />
          </Collapse>
        </div>
        {/* Scope chips and score cards tuck away while reading down, return on the way up. */}
        <div
          className={cn(
            'pointer-events-auto relative z-10 border-b border-border bg-background px-4 pb-2 transition-transform duration-300 ease-out',
            panelHidden && '-translate-y-full',
          )}
          inert={panelHidden}
          aria-hidden={panelHidden}
        >
          <ScopeBar
            scope={s.scope}
            items={s.rowItems}
            canFollow={s.viewerFollows.length > 0}
            canPredict={Boolean(s.kalshi.data)}
            canFantasy={s.fantasyLeagues.length > 0}
          />
          <div className={cn('transition-opacity', dimmed && 'opacity-50')}>
            {s.scope === 'fantasy' && !gameId ? (
              // Matchups move like scores: their cards replace the Games'.
              <FantasyStrip
                leagues={s.fantasyLeagues}
                selected={s.selectedMatchup?.id}
                onSelect={s.selectMatchup}
                onDetails={onMatchup}
              />
            ) : s.scope === 'predictions' && !gameId ? (
              // Predictions move like scores: their cards replace the Games'.
              <>
                <PredictionStrip
                  predictions={s.openPredictions}
                  selected={s.selectedPrediction?.id}
                  onSelect={s.selectPrediction}
                  onDetails={onPrediction}
                  display={display}
                />
                <PredictionSummary
                  predictions={s.openPredictions}
                  display={display}
                  onOpen={onPrediction}
                />
                <SharpPicksBanner />
              </>
            ) : (
              <>
                <GameStrip
                  games={(dimmed && previousGames.length
                    ? previousGames
                    : games
                  ).filter((g) =>
                    inScope(
                      g,
                      s.scope,
                      s.viewerFollows,
                      items,
                      s.leagues,
                      s.predictionGames,
                    ),
                  )}
                  selected={gameId ?? undefined}
                  onBox={onBox}
                />
                {gameId && (
                  <PredictionStrip
                    predictions={s.openPredictions.filter((p) =>
                      p.legs.some((l) => l.game?.id === gameId),
                    )}
                    onSelect={s.selectPrediction}
                    onDetails={onPrediction}
                    display={display}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
