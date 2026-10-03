/**
 * Catch-up (CONTEXT.md): a card at the top of the Timeline when the Viewer
 * returns past their Read Marker, opening a sheet of the Finals and key
 * Plays since. Dismissing it hides it until there is a newer Read Marker.
 */

import { useState } from 'react'
import type { CatchUp } from '@/lib/timeline/catchup'
import { catchUpLine } from '@/lib/timeline/catchup'
import { Sheet } from '@/components/chat/Sheet'
import {
  LeagueAvatar,
  Notice,
  PlayBubble,
  TeamAvatar,
  TeamAvatarLink,
} from '@/components/chat/ChatParts'

const DISMISSED_KEY = 'sportsline:catchup-dismissed'

function dismissedFor(readAt: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === readAt
  } catch {
    return false
  }
}

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
  const [dismissed, setDismissed] = useState(() => dismissedFor(readAt))
  if (dismissed) return null
  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, readAt)
    } catch {
      // Private mode: it stays dismissed for this visit only.
    }
  }
  const teams = [
    ...new Map(
      [...catchUp.finals, ...catchUp.keyPlays].map((i) => [
        i.gameId,
        i.side === 'away' ? i.awayTeam : i.homeTeam,
      ]),
    ).values(),
  ].slice(0, 3)
  return (
    <div className="relative flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-3.5 py-3">
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
                className="absolute rounded-full ring-2 ring-accent-soft"
                style={{ top: offset, left: offset, zIndex: teams.length - i }}
              >
                <TeamAvatar team={team} size={24} />
              </span>
            )
          })}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-bold">
            While you were away
            <span className="font-semibold text-muted">
              {' '}
              · {catchUp.newCount} new
            </span>
          </span>
          <span className="truncate text-[13px] text-accent">
            {catchUpLine(catchUp)}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss catch-up"
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-lg leading-none text-muted hover:bg-notice hover:text-foreground"
      >
        ×
      </button>
    </div>
  )
}

/** Finals, then the key Plays, newest first. Opening anything closes it. */
export function CatchUpSheet({
  catchUp,
  now,
  onClose,
}: {
  catchUp: CatchUp
  now: number
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
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
            Finals
          </h3>
          {catchUp.finals.map((item) => (
            <div key={item.id} className="flex">
              <Notice item={item} now={now} showLeague />
            </div>
          ))}
        </section>
      )}
      {catchUp.keyPlays.length > 0 && (
        <section className="flex flex-col gap-3" onClickCapture={onClose}>
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
            Key plays
          </h3>
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
                  <span className="px-1 text-[11px] text-muted">
                    <span className="font-semibold text-foreground/80">
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
