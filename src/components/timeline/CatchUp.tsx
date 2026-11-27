/**
 * Catch-up (CONTEXT.md): a card at the top of the Timeline when the Viewer
 * returns past their Read Marker, opening a sheet of the Finals and key
 * Plays since. Dismissing it hides it until there is a newer Read Marker.
 */

import type { CatchUp } from '@/lib/timeline/catchup'
import { useStoredValue } from '@/lib/useStoredValue'
import { catchUpLine } from '@/lib/timeline/catchup'
import { Sheet } from '@/components/chat/Sheet'
import {
  LeagueAvatar,
  Notice,
  PlayBubble,
  TeamAvatar,
  TeamAvatarLink,
} from '@/components/chat/ChatParts'
import { SectionLabel } from '@/components/signal/Section'

const DISMISSED_KEY = 'sportsline:catchup-dismissed'

/** The card, until dismissed for this Read Marker. */
export function CatchUpCard({
  catchUp,
  readAt,
  onOpen,
}: {
  catchUp: CatchUp
  readAt: string
  onOpen: () => void
}) {
  const [dismissedAt, setDismissedAt] = useStoredValue(DISMISSED_KEY)
  if (dismissedAt === readAt) return null
  const dismiss = () => setDismissedAt(readAt)
  const teams = [
    ...new Map(
      [...catchUp.finals, ...catchUp.keyPlays].map((i) => [
        i.gameId,
        i.side === 'away' ? i.awayTeam : i.homeTeam,
      ]),
    ).values(),
  ].slice(0, 3)
  return (
    <div
      data-catch-up=""
      className="well relative flex items-center gap-3 rounded-card px-3.5 py-3"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="relative size-8 shrink-0" aria-hidden="true">
          {teams.map((team, i) => {
            const offset = (teams.length - 1 - i) * 4
            return (
              <span
                key={team.id}
                className="absolute rounded-full ring-2 ring-notice"
                style={{ top: offset, left: offset, zIndex: teams.length - i }}
              >
                <TeamAvatar team={team} size={24} />
              </span>
            )
          })}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-3xs text-muted uppercase">
            While you were away · {catchUp.newCount} new
          </span>
          <span className="truncate text-[13.5px] leading-snug font-medium">
            {catchUpLine(catchUp)}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss catch-up"
        className="key flex size-9 shrink-0 items-center justify-center rounded-control text-lg leading-none"
      >
        ×
      </button>
    </div>
  )
}

/** Finals, then the key Plays, newest first. Opening anything closes it. */
export function CatchUpSheet({
  catchUp,
  onClose,
}: {
  catchUp: CatchUp
  onClose: () => void
}) {
  return (
    <Sheet title="Catch up" onClose={onClose}>
      <p className="text-sm text-muted">
        {catchUp.newCount} new across {catchUp.gameCount}{' '}
        {catchUp.gameCount === 1 ? 'game' : 'games'} · {catchUpLine(catchUp)}
      </p>
      {catchUp.finals.length > 0 && (
        <section className="flex flex-col gap-2" onClickCapture={onClose}>
          <SectionLabel as="h3" title="Finals" className="mb-0" />
          {catchUp.finals.map((item) => (
            <div key={item.id} className="flex">
              <Notice item={item} showLeague />
            </div>
          ))}
        </section>
      )}
      {catchUp.keyPlays.length > 0 && (
        <section className="flex flex-col gap-3" onClickCapture={onClose}>
          <SectionLabel as="h3" title="Key plays" className="mb-0" />
          {catchUp.keyPlays.map((item) => {
            const team = item.side === 'home' ? item.homeTeam : item.awayTeam
            return (
              <div key={item.id} className="flex items-end gap-2">
                {item.side ? (
                  <TeamAvatarLink team={team} />
                ) : (
                  <LeagueAvatar league={item.league} />
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="px-1 font-label text-3xs text-muted">
                    <span className="font-bold text-foreground/80">
                      {item.awayTeam.abbreviation} @{' '}
                      {item.homeTeam.abbreviation}
                    </span>{' '}
                    · {item.segmentLabel}
                  </span>
                  <PlayBubble item={item} align="left" position="single" />
                </div>
              </div>
            )
          })}
        </section>
      )}
    </Sheet>
  )
}
