/**
 * Watch Party building blocks shared by the Timeline feed and a Game's
 * thread: team avatars, Play bubbles (Routine, Notable, Scoring), folded
 * runs, notices and the typing indicator.
 */

import { Link } from '@tanstack/react-router'
import { memo, useState } from 'react'
import { PlayText } from './PlayText'
import { ReactionPills, useItemReactions, useLongPress } from './Reactions'
import { StakeTags } from './StakeTags'
import type { Bubble } from '@/lib/timeline/chat'
import type { TeamRef, TimelineItem } from '@/lib/model/timeline'
import type { League } from '@/lib/model/types'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { TimeAgo } from '@/components/timeline/format'
import { segmentDescription } from '@/lib/timeline/format'
import { bubbleTints, notableLead, scoringHeadline } from '@/lib/timeline/chat'
import { gameSearch, useVtName } from '@/lib/timeline/gameLink'
import { markPlayOpened } from '@/lib/timeline/playSheet'
import { scoringSummary } from '@/lib/timeline/sides'
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
      className="panel flex shrink-0 items-center justify-center rounded-full border border-bubble-border bg-surface px-1"
      style={{ minWidth: size, height: size }}
      title={team.abbreviation}
    >
      <TeamLogo team={team} size={size - 8} />
      {!team.logoUrl && (
        <span className="text-3xs leading-none font-bold tracking-tight">
          {team.abbreviation}
        </span>
      )}
    </span>
  )
}

/** A Team's avatar that opens its Team page. */
export function TeamAvatarLink({
  team,
  size = 32,
}: {
  team: TeamRef
  size?: number
}) {
  return (
    <Link
      to="/teams/$teamId"
      params={{ teamId: team.id }}
      aria-label={`${team.abbreviation} team page`}
      className="shrink-0 rounded-full transition-transform active:scale-95"
    >
      <TeamAvatar team={team} size={size} />
    </Link>
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
  const tight = align === 'left' ? 'rounded-bl-control' : 'rounded-br-control'
  const stackTight =
    align === 'left' ? 'rounded-l-control' : 'rounded-r-control'
  switch (position) {
    case 'single':
    case 'last':
      return cn(
        'rounded-sheet',
        tight,
        position === 'last' &&
          (align === 'left' ? 'rounded-tl-control' : 'rounded-tr-control'),
      )
    case 'first':
      return cn(
        'rounded-sheet',
        align === 'left' ? 'rounded-bl-control' : 'rounded-br-control',
      )
    case 'middle':
      return cn('rounded-sheet', stackTight)
  }
}

function positionOf(
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

/** A team as Signal draws it small: a square chip of its color. */
function TeamChip({ team }: { team: TeamRef }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 shrink-0 rounded-[2px] bg-current"
      style={
        team.colors?.primary ? { background: team.colors.primary } : undefined
      }
    />
  )
}

/**
 * The team's wash on a bubble (styles.css .team-tint), kept faint as
 * Signal asks: graphite's mix is strong, so its tint is pre-thinned here.
 */
function tintStyle(colors: TeamRef['colors']): React.CSSProperties | undefined {
  const tints = bubbleTints(colors)
  if (!tints) return undefined
  return {
    '--tint-light': `color-mix(in srgb, ${tints.light} 50%, var(--bubble))`,
    '--tint-dark': `color-mix(in srgb, ${tints.dark} 20%, var(--bubble))`,
  } as React.CSSProperties
}

export function PlayBubble({
  item,
  align,
  position,
  compact,
  reactable = true,
}: {
  item: TimelineItem
  align: Align
  position: 'single' | 'first' | 'middle' | 'last'
  /** Thread view: less chrome, no score line on Scoring bubbles' header. */
  compact?: boolean
  /** Long-press to react, with Reaction counts under it (off in a share image). */
  reactable?: boolean
}) {
  const press = useLongPress(item)
  const reactions = useItemReactions()
  if (!reactable) {
    return (
      <PlayBubbleLink
        item={item}
        align={align}
        position={position}
        compact={compact}
      />
    )
  }
  return (
    <>
      <PlayBubbleLink
        item={item}
        align={align}
        position={position}
        compact={compact}
        press={press}
      />
      <ReactionPills reactions={reactions?.get(item.id)} align={align} />
      <StakeTags item={item} align={align} />
    </>
  )
}

function PlayBubbleLink({
  item,
  align,
  position,
  compact,
  press,
}: {
  item: TimelineItem
  align: Align
  position: 'single' | 'first' | 'middle' | 'last'
  compact?: boolean
  press?: ReturnType<typeof useLongPress>
}) {
  const shape = corner(align, position)
  const struck = item.status === 'overturned'
  const scoring = item.kind === 'overturn' || item.significance === 'scoring'

  if (scoring) {
    const overturn = item.kind === 'overturn'
    // T4: the headline word, a short "who did what", the full sentence small.
    const summary = scoringSummary(item)
    // Signal: ink-inverted, with the orange light for the score just made
    // (an Overturn stays on the bubble's own material, ringed in ink).
    return (
      <Link
        to="."
        search={(prev) => ({ ...prev, play: item.id })}
        resetScroll={false}
        onClick={markPlayOpened}
        {...press}
        data-scoring=""
        className={cn(
          'flex max-w-[300px] flex-col gap-1.5 px-4 pt-3 pb-3.5 transition-transform select-none [-webkit-touch-callout:none] active:translate-y-px',
          shape,
          overturn
            ? 'border-2 border-foreground bg-bubble text-foreground'
            : 'bg-foreground text-background shadow-[0_2px_0_#000,0_8px_18px_-10px_var(--key-shade)]',
          struck && 'opacity-60',
        )}
      >
        <span className="flex items-center gap-2 text-3xs font-bold uppercase">
          <span
            aria-hidden="true"
            className={cn('led', overturn && 'led-off')}
          />
          <span className={overturn ? 'text-muted' : 'opacity-70'}>Score</span>
        </span>
        <span className="text-[22px] leading-none font-extrabold tracking-tight">
          {scoringHeadline(item)}
        </span>
        {summary ? (
          <>
            <span
              className={cn(
                'text-base leading-snug font-bold',
                struck && 'line-through',
              )}
            >
              {summary}
            </span>
            <span
              className={cn(
                'text-[12.5px] leading-snug opacity-70',
                struck && 'line-through',
              )}
            >
              {cleanDescription(item)}
            </span>
          </>
        ) : (
          <span
            className={cn('text-[15px] leading-snug', struck && 'line-through')}
          >
            <PlayText item={item} onFill />
          </span>
        )}
        {!compact && (
          <span className="mt-0.5 flex items-center gap-2 border-t border-current/15 pt-2 font-label text-xs font-bold tabular-nums">
            <TeamChip team={item.awayTeam} />
            {item.awayTeam.abbreviation} {item.score.away} – {item.score.home}{' '}
            {item.homeTeam.abbreviation}
            <TeamChip team={item.homeTeam} />
          </span>
        )}
      </Link>
    )
  }

  const lead = notableLead(item)
  return (
    <Link
      to="."
      search={(prev) => ({ ...prev, play: item.id })}
      resetScroll={false}
      onClick={markPlayOpened}
      {...press}
      className={cn(
        'team-tint block max-w-[300px] border px-3.5 py-2.5 text-[15px] leading-snug shadow-[inset_0_1px_0_var(--key-highlight),0_8px_18px_-16px_var(--key-shade)] transition-colors select-none [-webkit-touch-callout:none] hover:brightness-[0.97] dark:hover:brightness-110',
        shape,
        struck && 'line-through opacity-60',
      )}
      style={tintStyle(actingTeam(item).colors)}
    >
      {lead && <span className="mr-1 font-bold text-notable">{lead}.</span>}
      <PlayText item={item} />
      {item.revisedAt && item.status === 'active' && (
        <span className="ml-1.5 align-middle text-2xs font-semibold text-muted">
          · updated
        </span>
      )}
    </Link>
  )
}

function FoldBubble({
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
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        'team-tint flex min-h-11 max-w-[300px] items-center gap-2 rounded-control border border-dashed px-4 text-left text-[13px] text-muted hover:text-foreground',
        align === 'right' && 'self-end',
      )}
      style={tintStyle(actingTeam(items[0]).colors)}
    >
      <span className="shrink-0 font-label text-3xs font-bold text-foreground uppercase">
        +{items.length} plays
      </span>
      <span className="truncate">
        {segmentDescription(
          items[0].description,
          items[0].league,
          items[0].players,
        )
          .map((seg) => seg.text)
          .join('')}
      </span>
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
  const vtName = useVtName()
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

export const Notice = memo(function Notice({
  item,
  showLeague,
}: {
  item: TimelineItem
  showLeague?: boolean
}) {
  const className = cn(
    'well flex max-w-[320px] items-center gap-1.5 self-center rounded-full px-3 py-1 text-xs font-semibold text-muted hover:text-foreground',
    item.milestone === 'final' && 'text-foreground',
  )
  const body = (
    <>
      {showLeague && <LeagueLogo league={item.league} size={16} />}
      <span className="truncate">{item.description}</span>
      <span className="shrink-0 font-label text-3xs font-normal tabular-nums">
        · <TimeAgo iso={item.occurredAt} />
      </span>
    </>
  )
  // A Milestone opens its Game inside the Timeline; a side-less Play its Play Detail.
  if (item.kind === 'milestone') {
    return (
      <Link
        to="/"
        search={(prev) => ({
          ...prev,
          play: undefined,
          ...gameSearch(item.gameId, item.sportsDay),
        })}
        className={className}
      >
        {body}
      </Link>
    )
  }
  return (
    <Link
      to="."
      search={(prev) => ({ ...prev, play: item.id })}
      resetScroll={false}
      onClick={markPlayOpened}
      className={cn(
        'well flex max-w-[320px] items-center gap-1.5 self-center rounded-full px-3 py-1 text-xs font-semibold text-muted hover:text-foreground',
        item.milestone === 'final' && 'text-foreground',
      )}
    >
      {showLeague && <LeagueLogo league={item.league} size={16} />}
      <span className="truncate">{item.description}</span>
      <span className="shrink-0 font-label text-3xs font-normal tabular-nums">
        · <TimeAgo iso={item.occurredAt} />
      </span>
    </Link>
  )
})

export function TypingDots({ align }: { align: Align }) {
  return (
    <span
      className={cn(
        'flex w-14 items-center justify-center gap-1 rounded-sheet border border-bubble-border bg-bubble px-3.5 py-3 shadow-[inset_0_1px_0_var(--key-highlight)]',
        align === 'left' ? 'rounded-bl-control' : 'rounded-br-control',
      )}
      role="img"
      aria-label="Play in progress"
    >
      {[0, 0.2, 0.4].map((delay) => (
        <span
          key={delay}
          className="typing-dot size-[7px] rounded-full bg-foreground"
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
      data-read-marker=""
      className="my-1 flex items-center gap-2.5 text-3xs text-notable uppercase"
    >
      <span className="h-0 flex-1 border-t border-dashed border-muted" />
      You were here{count > 0 ? ` · ${count} new` : ''}
      <span className="h-0 flex-1 border-t border-dashed border-muted" />
    </div>
  )
}

/** The Play's sentence as a caption: segmented (so noise is dropped), joined. */
function cleanDescription(item: TimelineItem): string {
  const description =
    item.kind === 'overturn'
      ? item.description.replace(/^Overturned: /, '')
      : item.description
  return segmentDescription(description, item.league, [])
    .map((seg) => seg.text)
    .join('')
}
