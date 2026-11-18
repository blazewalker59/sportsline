/**
 * The Timeline's pinned top: the header (day, Highlights, connection) with
 * the day strip under it, then (under the All tab) the League row, and the
 * cards for the Scope: Fantasy Matchups, Predictions, or the day's Games.
 * The Scope itself is chosen from the main navigation. Pinned over the content
 * rather than in its flow: hiding the cards slides them up behind the
 * header without changing the page's height, so scrolling never feeds back
 * into the hide/show.
 *
 * From `lg` the Timeline is two columns (the feed, and the selected Game's
 * pane); this top lays itself out on the same grid and stays over the
 * feed's column, since the day, Scope and Games are the feed's context.
 */

import { DayButton } from './DayButton'
import { DayStrip } from './DayStrip'
import { LeagueBar } from './LeagueBar'
import { GameStrip } from './GameStrip'
import { Collapse, ConnectionDot, HighlightsButton } from './TimelineControls'
import { inScope } from './timelineScope'
import type { TimelineScopeState } from './useTimelineScope'
import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import type { Connection } from '@/lib/timeline/useLiveTimeline'
import type { LeagueMatchup } from '@/lib/fantasy/matchup'
import { FantasyStrip } from '@/components/fantasy/FantasyParts'
import { PredictionStrip } from '@/components/predictions/PredictionCard'
import { PredictionSummary } from '@/components/predictions/PredictionPortfolio'
import { AppHeader } from '@/components/layout/AppHeader'
import { NAV_INSET_LEFT } from '@/components/layout/AppNav'
import { scopeTab } from '@/lib/model/scope'
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
  onSelectPrediction,
  onSelectMatchup,
}: {
  topRef: React.Ref<HTMLDivElement>
  scope: TimelineScopeState
  sportsDay: string
  today: string
  gameId: string | null
  dayOpen: boolean
  onDayToggle: () => void
  onDayClose: () => void
  /** The League row and cards are tucked away (reading down). */
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
  /** Open a Prediction in full (a sheet, or the wide Timeline's pane). */
  onPrediction: (id: string) => void
  /** Open a league's Matchup in full: the Viewer's, or another in it. */
  onMatchup: (id: string, other?: LeagueMatchup) => void
  /** Narrow the Timeline to one Prediction (a card tapped), or clear it. */
  onSelectPrediction: (id: string | null) => void
  /** Narrow the Timeline to one Matchup, or clear it. */
  onSelectMatchup: (id: string | null) => void
}) {
  const display = s.kalshi.data?.changeDisplay
  return (
    <div
      ref={topRef}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-10',
        NAV_INSET_LEFT,
      )}
      style={{ viewTransitionName: 'pinned' }}
    >
      <div className="mx-auto max-w-xl lg:grid lg:max-w-5xl lg:grid-cols-2 lg:gap-6 lg:px-4">
        <div>
          <div
            className={cn(
              'pointer-events-auto relative z-20 bg-background px-4 transition-[border-color] lg:px-0',
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
              <DayStrip
                sportsDay={sportsDay}
                today={today}
                onPick={onDayClose}
              />
            </Collapse>
          </div>
          {/* The League row and score cards tuck away while reading down, return on the way up. */}
          <div
            className={cn(
              'pointer-events-auto relative z-10 border-b border-border bg-background px-4 pb-2 transition-transform duration-300 ease-out lg:px-0',
              panelHidden && '-translate-y-full',
            )}
            inert={panelHidden}
            aria-hidden={panelHidden}
          >
            {/* Which League, under the All tab (the nav's tabs are the other Scopes). */}
            {scopeTab(s.scope) === 'all' && (
              <LeagueBar scope={s.scope} items={s.rowItems} />
            )}
            <div className={cn('transition-opacity', dimmed && 'opacity-50')}>
              {s.setup ? null : s.scope === 'fantasy' && !gameId ? (
                // Matchups move like scores: their cards replace the Games'.
                <FantasyStrip
                  leagues={s.fantasyLeagues}
                  selected={s.selectedMatchup?.id}
                  onSelect={onSelectMatchup}
                  onDetails={onMatchup}
                />
              ) : s.scope === 'predictions' && !gameId ? (
                // Predictions move like scores: their cards replace the Games'.
                <>
                  <PredictionStrip
                    predictions={s.openPredictions}
                    selected={s.selectedPrediction?.id}
                    onSelect={onSelectPrediction}
                    onDetails={onPrediction}
                    display={display}
                  />
                  <PredictionSummary
                    predictions={s.openPredictions}
                    display={display}
                    onOpen={onPrediction}
                  />
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
                      onSelect={onSelectPrediction}
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
    </div>
  )
}
