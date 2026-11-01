/**
 * A small mark in a team's color beside a row (a combo's Leg, a Lineup
 * Player), so whose it is reads at a glance. Its color holds up in both
 * themes (lib/brand/subject.ts washColor); without colors, nothing.
 */

import type { TeamColors } from '@/lib/brand/teamColors'
import { subjectStyle, teamSubject } from '@/lib/brand/subject'
import { cn } from '@/lib/utils'

export function TeamPip({
  colors,
  className,
}: {
  colors: TeamColors | null | undefined
  className?: string
}) {
  const side = teamSubject(colors)
  if (!side) return null
  return (
    <span
      aria-hidden="true"
      className={cn('subject subject-pip shrink-0 rounded-full', className)}
      style={subjectStyle(side)}
    />
  )
}
