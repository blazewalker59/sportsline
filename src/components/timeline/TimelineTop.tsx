/**
 * The Timeline's pinned top, the same at every width: the header (day,
 * Highlights, connection) with the day strip under it, and once the home
 * board (LiveBoard) has scrolled away, the pinned bar of the tab's headline
 * and scores (LiveTicker). The tab, its League and what it's narrowed to
 * are all picked from the home board over the feed, not up here. Pinned
 * over the content rather than in its flow: the pinned bar lies over what's
 * under the header without changing the page's height, so scrolling never
 * feeds back into its showing.
 *
 * From `lg` the Timeline is two columns (the feed, and the pane where a
 * Game, Prediction or Matchup opens); this top lays itself out on the same
 * grid and stays over the feed's column.
 */

import { DayButton } from './DayButton'
import { DayStrip } from './DayStrip'
import { Collapse, ConnectionDot, HighlightsButton } from './TimelineControls'
import type { Connection } from '@/lib/timeline/useLiveTimeline'
import { AppHeader } from '@/components/layout/AppHeader'
import { NAV_INSET_LEFT } from '@/components/layout/AppNav'
import { withViewTransition } from '@/lib/viewTransition'
import { cn } from '@/lib/utils'

export function TimelineTop({
  topRef,
  sportsDay,
  today,
  dayOpen,
  onDayToggle,
  onDayClose,
  highlights,
  onHighlights,
  connection,
  ticker,
}: {
  topRef: React.Ref<HTMLDivElement>
  sportsDay: string
  today: string
  dayOpen: boolean
  onDayToggle: () => void
  onDayClose: () => void
  highlights: boolean
  onHighlights: (on: boolean) => void
  connection: Connection
  /**
   * The home board's headline and scores, pinned once the board scrolls
   * away (LiveTicker). Laid over what's under the header, not added to the
   * top's height, so showing it never moves the page.
   */
  ticker?: React.ReactNode
}) {
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
        <div className="pointer-events-auto relative z-20 border-b border-border bg-background px-4 lg:px-0">
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
          {ticker && !dayOpen && (
            <div className="animate-in fade-in slide-in-from-top-1 absolute inset-x-0 top-full border-b border-border bg-background duration-200">
              {ticker}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
