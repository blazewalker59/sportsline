import { useMemo } from 'react'
import type { Segment } from '@/lib/timeline/format'
import type { TimelineItem } from '@/lib/model/timeline'
import { nameColors } from '@/lib/timeline/chat'
import { segmentDescription } from '@/lib/timeline/format'
import { playerSide } from '@/lib/timeline/sides'
import { cn } from '@/lib/utils'

/**
 * A Play's description with each name in its team's color (offense vs
 * defense at a glance), the action bold, and the filler words faded.
 */
export function PlayText({
  item,
  onFill,
}: {
  item: TimelineItem
  /** On a full team-color bubble: inherit its text color, vary weight/opacity. */
  onFill?: boolean
}) {
  const description =
    item.kind === 'overturn'
      ? item.description.replace(/^Overturned: /, '')
      : item.description
  const segments = useMemo(
    () =>
      segmentDescription(
        description,
        item.league,
        item.players.map((p) => ({ name: p.name, side: playerSide(item, p) })),
      ),
    [description, item],
  )
  return (
    <>
      {segments.map((s, i) => (
        <span
          key={i}
          className={styleFor(s, Boolean(onFill))}
          style={onFill ? undefined : nameColor(s, item)}
        >
          {s.text}
        </span>
      ))}
    </>
  )
}

/** Team color for a player's name, as CSS variables .team-name reads. */
function nameColor(
  s: Segment,
  item: TimelineItem,
): React.CSSProperties | undefined {
  if (s.kind !== 'player' || !s.side) return undefined
  const team = s.side === 'home' ? item.homeTeam : item.awayTeam
  const tints = nameColors(team.colors)
  if (!tints) return undefined
  return {
    '--name-light': tints.light,
    '--name-dark': tints.dark,
  } as React.CSSProperties
}

function styleFor(s: Segment, onFill: boolean): string | undefined {
  const { kind, muted } = s
  if (onFill) {
    return cn(
      kind === 'player' && 'font-bold',
      (kind === 'result' || kind === 'flag') && 'font-extrabold',
      (kind === 'place' || kind === 'aside' || kind === 'plain' || muted) &&
        'opacity-75',
      kind === 'aside' && 'text-[0.92em]',
    )
  }
  return cn(
    kind === 'player' && 'team-name font-bold',
    kind === 'player' && muted && 'opacity-80',
    kind === 'result' && 'font-bold text-foreground',
    kind === 'flag' && 'font-bold text-amber-700 dark:text-amber-400',
    (kind === 'plain' || kind === 'place') && 'text-foreground/55',
    kind === 'aside' && 'text-[0.9em] text-foreground/50',
  )
}
