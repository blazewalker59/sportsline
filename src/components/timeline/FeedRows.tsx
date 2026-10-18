/**
 * The Timeline's rows: a cluster of one team's bubbles, a live Game's
 * typing indicator, and several live Games collapsed into one.
 */

import { Link } from '@tanstack/react-router'
import { memo } from 'react'
import { TimeAgo } from './format'
import type { FeedEntry, Typing } from '@/lib/timeline/chat'
import type { GameSummary } from '@/lib/model/timeline'
import {
  BubbleStack,
  LeagueAvatar,
  TeamAvatar,
  TeamAvatarLink,
  TypingDots,
} from '@/components/chat/ChatParts'
import { gameSearch } from '@/lib/timeline/gameLink'
import { cn } from '@/lib/utils'

/** When an entry happened: its first bubble's time (for the read divider). */
export function entryTime(entry: FeedEntry): string {
  if (entry.type === 'notice') return entry.item.occurredAt
  const first = entry.bubbles[0]
  return first.type === 'fold'
    ? first.items[0].occurredAt
    : first.item.occurredAt
}

type ClusterEntry = Extract<FeedEntry, { type: 'cluster' }>

interface ClusterProps {
  entry: ClusterEntry
  /** One Game is selected: the home team answers from the right, like a thread. */
  focused: boolean
}

/**
 * The feed is rebuilt on every socket event, so each cluster is a new
 * object: it's the same cluster while its bubbles hold the same Plays.
 */
function sameCluster(a: ClusterProps, b: ClusterProps): boolean {
  if (a.focused !== b.focused) return false
  const x = a.entry
  const y = b.entry
  if (x === y) return true
  if (
    x.id !== y.id ||
    x.gameId !== y.gameId ||
    x.side !== y.side ||
    x.bubbles.length !== y.bubbles.length
  ) {
    return false
  }
  return x.bubbles.every((p, i) => {
    const q = y.bubbles[i]
    if (p.type === 'play') return q.type === 'play' && p.item === q.item
    return (
      q.type === 'fold' &&
      p.id === q.id &&
      p.items.length === q.items.length &&
      p.items.every((item, j) => item === q.items[j])
    )
  })
}

export const Cluster = memo(function Cluster({ entry, focused }: ClusterProps) {
  const first = entry.bubbles[0]
  const lead = first.type === 'fold' ? first.items[0] : first.item
  const team = entry.side === 'home' ? lead.homeTeam : lead.awayTeam
  const align = focused && entry.side === 'home' ? 'right' : 'left'
  return (
    <div
      className={cn(
        'flex items-end gap-2',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      <TeamAvatarLink team={team} />
      <div
        className={cn(
          'flex min-w-0 flex-col gap-1',
          align === 'right' && 'items-end',
        )}
      >
        {/* The avatar opens the Team; this line opens just this Game. */}
        <Link
          to="/"
          search={(prev) => ({
            ...prev,
            play: undefined,
            ...gameSearch(entry.gameId, lead.sportsDay),
          })}
          viewTransition
          resetScroll={false}
          aria-label={`Show only the ${team.abbreviation} game`}
          className="px-1 text-[11px] text-muted"
        >
          <span className="font-semibold text-foreground/80">
            {team.abbreviation}
          </span>{' '}
          · {lead.segmentLabel} · <TimeAgo iso={lead.occurredAt} />
        </Link>
        <BubbleStack bubbles={entry.bubbles} align={align} />
      </div>
    </div>
  )
}, sameCluster)

export function TypingRow({
  typing,
  game,
  focused,
  onClick,
}: {
  typing: Typing
  game: GameSummary
  focused: boolean
  /** Also on following the link (closing the sheet it's listed in). */
  onClick?: () => void
}) {
  const team =
    typing.side === 'home'
      ? game.homeTeam
      : typing.side === 'away'
        ? game.awayTeam
        : null
  const right = focused && typing.side === 'home'
  return (
    <Link
      to="/"
      search={(prev) => ({
        ...prev,
        play: undefined,
        ...gameSearch(game.id, game.sportsDay),
      })}
      viewTransition
      resetScroll={false}
      onClick={onClick}
      className={cn('flex items-end gap-2', right && 'flex-row-reverse')}
    >
      {team ? (
        <TeamAvatar team={team} />
      ) : (
        <LeagueAvatar league={game.league} />
      )}
      <div className={cn('flex min-w-0 flex-col gap-1', right && 'items-end')}>
        <span className="truncate px-1 text-[11px] text-muted">
          <span className="font-semibold text-foreground/80">
            {team
              ? team.abbreviation
              : `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`}
          </span>{' '}
          · {typing.text}
        </span>
        <TypingDots align={right ? 'right' : 'left'} />
      </div>
    </Link>
  )
}

/** Stacked avatars: up to three, stepped so the stack fills 32px. */
const STACK_AVATAR = 24
const STACK_STEP = 4

/**
 * Several Games in progress at once, as one typing bubble: their teams'
 * avatars stacked and a count. Opens the list of what's live.
 */
export function TypingSummary({
  typing,
  onOpen,
}: {
  typing: Array<{ typing: Typing; game: GameSummary }>
  onOpen: () => void
}) {
  const shown = typing.slice(0, 3)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${typing.length} games in progress. Show them`}
      className="flex items-end gap-2 text-left"
    >
      {/*
        A stack the size of one avatar (32px), so the bubble lines up with
        every other message: each team's mark sits a few pixels behind the
        one in front.
      */}
      <span className="relative size-8 shrink-0" aria-hidden="true">
        {shown.map(({ typing: t, game: g }, i) => {
          const team =
            t.side === 'home'
              ? g.homeTeam
              : t.side === 'away'
                ? g.awayTeam
                : null
          const offset = (shown.length - 1 - i) * STACK_STEP
          return (
            <span
              key={g.id}
              className="absolute rounded-full ring-2 ring-background"
              style={{ top: offset, left: offset, zIndex: shown.length - i }}
            >
              {team ? (
                <TeamAvatar team={team} size={STACK_AVATAR} />
              ) : (
                <LeagueAvatar league={g.league} size={STACK_AVATAR} />
              )}
            </span>
          )
        })}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate px-1 text-[11px] text-muted">
          <span className="font-semibold text-foreground/80">
            {typing.length} games live
          </span>{' '}
          · tap to see all
        </span>
        <TypingDots align="left" />
      </span>
    </button>
  )
}
