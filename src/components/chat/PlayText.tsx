import { useMemo } from 'react'
import type { SegmentKind } from '@/lib/timeline/format'
import type { TimelineItem } from '@/lib/model/timeline'
import { segmentDescription } from '@/lib/timeline/format'
import { cn } from '@/lib/utils'

/** A Play's description with who, result, flags and places styled apart. */
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
    () => segmentDescription(description, item.league, item.players),
    [description, item.league, item.players],
  )
  return (
    <>
      {segments.map((s, i) => (
        <span key={i} className={styleFor(s.kind, s.muted, Boolean(onFill))}>
          {s.text}
        </span>
      ))}
    </>
  )
}

function styleFor(
  kind: SegmentKind,
  muted: boolean,
  onFill: boolean,
): string | undefined {
  if (onFill) {
    return cn(
      kind === 'player' && 'font-bold',
      (kind === 'result' || kind === 'flag') && 'font-extrabold',
      (kind === 'place' || kind === 'aside' || muted) && 'opacity-75',
      kind === 'aside' && 'text-[0.92em]',
    )
  }
  return cn(
    kind === 'player' &&
      (muted ? 'font-semibold text-muted' : 'font-semibold text-foreground'),
    kind === 'result' && 'font-bold text-notable',
    kind === 'flag' && 'font-bold text-amber-700 dark:text-amber-400',
    kind === 'place' && 'text-muted',
    kind === 'aside' && 'text-[0.92em] text-muted',
    kind === 'plain' && 'text-foreground/85',
  )
}
