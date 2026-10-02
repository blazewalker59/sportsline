/**
 * Watch Party building blocks shared by the Timeline feed and a Game's
 * thread: team avatars, Play bubbles (Routine, Notable, Scoring), folded
 * runs, notices and the typing indicator.
 */

import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { Bubble } from '@/lib/timeline/chat'
import type { TeamRef, TimelineItem } from '@/lib/model/timeline'
import type { League } from '@/lib/model/types'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { timeAgo } from '@/components/timeline/format'
import {
  bubbleTints,
  notableLead,
  scoringHeadline,
  textOn,
} from '@/lib/timeline/chat'
import { gameSearch, vtName } from '@/lib/timeline/gameLink'
import { cn } from '@/lib/utils'

export type Align = 'left' | 'right'

export function TeamAvatar({
  team,
  size = 32,
}: {
  team: TeamRef
  size?: number
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-bubble-border bg-surface"
      style={{ width: size, height: size }}
      title={team.abbreviation}
    >
      <TeamLogo team={team} size={size - 8} />
      {!team.logoUrl && (
        <span className="text-[10px] font-bold">{team.abbreviation}</span>
      )}
    </span>
  )
}

export function LeagueAvatar({
  league,
  size = 32,
}: {
  league: League
  size?: number
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-bubble-border bg-surface"
      style={{ width: size, height: size }}
    >
      <LeagueLogo league={league} size={size - 10} />
    </span>
  )
}

function corner(
  align: Align,
  position: 'single' | 'first' | 'middle' | 'last',
): string {
  // Chat-style tails: the corner nearest the avatar tightens on the last bubble.
  const tight = align === 'left' ? 'rounded-bl-md' : 'rounded-br-md'
  const stackTight = align === 'left' ? 'rounded-l-md' : 'rounded-r-md'
  switch (position) {
    case 'single':
    case 'last':
      return cn(
        'rounded-[20px]',
        tight,
        position === 'last' &&
          (align === 'left' ? 'rounded-tl-md' : 'rounded-tr-md'),
      )
    case 'first':
      return cn(
        'rounded-[20px]',
        align === 'left' ? 'rounded-bl-md' : 'rounded-br-md',
      )
    case 'middle':
      return cn('rounded-[20px]', stackTight)
  }
}

export function positionOf(
  index: number,
  count: number,
): 'single' | 'first' | 'middle' | 'last' {
  if (count === 1) return 'single'
  if (index === 0) return 'first'
  if (index === count - 1) return 'last'
  return 'middle'
}

/** The team whose bubble this is, for colors. */
function actingTeam(item: TimelineItem): TeamRef {
  return item.side === 'home' ? item.homeTeam : item.awayTeam
}

export function PlayBubble({
  item,
  align,
  position,
  compact,
}: {
  item: TimelineItem
  align: Align
  position: 'single' | 'first' | 'middle' | 'last'
  /** Thread view: less chrome, no score line on Scoring bubbles' header. */
  compact?: boolean
}) {
  const shape = corner(align, position)
  const struck = item.status === 'overturned'
  const scoring = item.kind === 'overturn' || item.significance === 'scoring'

  if (scoring) {
    const team = actingTeam(item)
    const fill =
      item.kind === 'overturn' ? null : (team.colors?.primary ?? null)
    return (
      <Link
        to="/plays/$playId"
        params={{ playId: item.id }}
        className={cn(
          'flex max-w-[300px] flex-col gap-1.5 px-4 py-3 transition-transform active:scale-[0.99]',
          shape,
          !fill && 'border-2 border-live bg-bubble',
          struck && 'opacity-60',
        )}
        style={fill ? { background: fill, color: textOn(fill) } : undefined}
      >
        <span
          className={cn(
            'text-[22px] leading-none font-extrabold tracking-tight',
            !fill && 'text-live',
          )}
        >
          {scoringHeadline(item)}
        </span>
        <span
          className={cn('text-[15px] leading-snug', struck && 'line-through')}
        >
          {item.kind === 'overturn'
            ? item.description.replace(/^Overturned: /, '')
            : item.description}
        </span>
        {!compact && (
          <span className="flex items-center gap-2 text-sm font-bold tabular-nums">
            <TeamLogo team={item.awayTeam} size={18} />
            {item.awayTeam.abbreviation} {item.score.away} – {item.score.home}{' '}
            {item.homeTeam.abbreviation}
            <TeamLogo team={item.homeTeam} size={18} />
          </span>
        )}
      </Link>
    )
  }

  const lead = notableLead(item)
  const tints = bubbleTints(actingTeam(item).colors)
  return (
    <Link
      to="/plays/$playId"
      params={{ playId: item.id }}
      className={cn(
        'team-tint block max-w-[300px] border px-3.5 py-2.5 text-[15px] leading-snug transition-colors hover:brightness-[0.97] dark:hover:brightness-110',
        shape,
        struck && 'line-through opacity-60',
      )}
      style={
        tints
          ? ({
              '--tint-light': tints.light,
              '--tint-dark': tints.dark,
            } as React.CSSProperties)
          : undefined
      }
    >
      {lead && <span className="mr-1 font-bold text-notable">{lead}.</span>}
      {item.description}
      {item.revisedAt && item.status === 'active' && (
        <span className="ml-1.5 align-middle text-[11px] font-semibold text-muted">
          · updated
        </span>
      )}
    </Link>
  )
}

export function FoldBubble({
  items,
  align,
  renderOpen,
}: {
  items: Array<TimelineItem>
  align: Align
  renderOpen: (items: Array<TimelineItem>) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (open) return <>{renderOpen(items)}</>
  const tints = bubbleTints(actingTeam(items[0]).colors)
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        'team-tint flex min-h-11 max-w-[300px] items-center gap-2 rounded-full border border-dashed px-4 text-left text-[13px] text-muted hover:text-foreground',
        align === 'right' && 'self-end',
      )}
      style={
        tints
          ? ({
              '--tint-light': tints.light,
              '--tint-dark': tints.dark,
            } as React.CSSProperties)
          : undefined
      }
    >
      <span className="shrink-0 font-semibold text-foreground">
        +{items.length} plays
      </span>
      <span className="truncate">{items[0].description}</span>
    </button>
  )
}

/** Renders one cluster's bubbles in order, expanding folds in place. */
export function BubbleStack({
  bubbles,
  align,
  compact,
}: {
  bubbles: Array<Bubble>
  align: Align
  compact?: boolean
}) {
  const flat = bubbles
  return (
    <div
      className={cn(
        'flex flex-col gap-1',
        align === 'right' ? 'items-end' : 'items-start',
      )}
    >
      {flat.map((b, i) =>
        b.type === 'fold' ? (
          <div key={b.id} style={{ viewTransitionName: vtName(b.id) }}>
            <FoldBubble
              items={b.items}
              align={align}
              renderOpen={(items) =>
                items.map((item, j) => (
                  <div
                    key={item.id}
                    className="flex flex-col"
                    style={{ viewTransitionName: vtName(item.id) }}
                  >
                    <PlayBubble
                      item={item}
                      align={align}
                      position={positionOf(j, items.length)}
                      compact={compact}
                    />
                  </div>
                ))
              }
            />
          </div>
        ) : (
          <div
            key={b.item.id}
            className="flex flex-col"
            style={{ viewTransitionName: vtName(b.item.id) }}
          >
            <PlayBubble
              item={b.item}
              align={align}
              position={positionOf(i, flat.length)}
              compact={compact}
            />
          </div>
        ),
      )}
    </div>
  )
}

export function Notice({
  item,
  now,
  showLeague,
}: {
  item: TimelineItem
  now: number
  showLeague?: boolean
}) {
  const className = cn(
    'flex max-w-[320px] items-center gap-1.5 self-center rounded-full bg-notice px-3 py-1 text-xs font-semibold text-muted hover:text-foreground',
    item.milestone === 'final' && 'text-foreground',
  )
  const body = (
    <>
      {showLeague && <LeagueLogo league={item.league} size={16} />}
      <span className="truncate">{item.description}</span>
      <span className="shrink-0 font-normal tabular-nums">
        · {timeAgo(item.occurredAt, now)}
      </span>
    </>
  )
  // A Milestone opens its Game inside the Timeline; a side-less Play its Play Detail.
  if (item.kind === 'milestone') {
    return (
      <Link
        to="/"
        search={gameSearch(item.gameId, item.sportsDay)}
        className={className}
      >
        {body}
      </Link>
    )
  }
  return (
    <Link
      to="/plays/$playId"
      params={{ playId: item.id }}
      className={cn(
        'flex max-w-[320px] items-center gap-1.5 self-center rounded-full bg-notice px-3 py-1 text-xs font-semibold text-muted hover:text-foreground',
        item.milestone === 'final' && 'text-foreground',
      )}
    >
      {showLeague && <LeagueLogo league={item.league} size={16} />}
      <span className="truncate">{item.description}</span>
      <span className="shrink-0 font-normal tabular-nums">
        · {timeAgo(item.occurredAt, now)}
      </span>
    </Link>
  )
}

export function TypingDots({ align }: { align: Align }) {
  return (
    <span
      className={cn(
        'flex w-14 items-center justify-center gap-1 rounded-[20px] bg-bubble px-3.5 py-3',
        align === 'left' ? 'rounded-bl-md' : 'rounded-br-md',
      )}
      role="img"
      aria-label="Play in progress"
    >
      {[0, 0.2, 0.4].map((delay) => (
        <span
          key={delay}
          className="typing-dot size-[7px] rounded-full bg-muted"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  )
}

export function ReadDivider({ count }: { count: number }) {
  return (
    <div
      aria-label="You were here"
      className="flex items-center gap-2 text-xs font-bold text-accent"
    >
      <span className="h-px flex-1 bg-accent/60" />
      You were here{count > 0 ? ` · ${count} new` : ''}
      <span className="h-px flex-1 bg-accent/60" />
    </div>
  )
}
