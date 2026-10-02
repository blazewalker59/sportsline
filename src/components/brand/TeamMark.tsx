import { useState } from 'react'
import type { TeamRef } from '@/lib/model/timeline'
import { cn } from '@/lib/utils'

/** A Team's logo; renders nothing if there is none or it fails to load. */
export function TeamLogo({
  team,
  size = 18,
  className,
}: {
  team: Pick<TeamRef, 'abbreviation' | 'logoUrl'>
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!team.logoUrl || failed) return null
  return (
    <img
      src={team.logoUrl}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  )
}

/** A Team as logo plus abbreviation, the way Teams appear everywhere. */
export function TeamMark({
  team,
  size = 18,
  className,
  bold,
}: {
  team: Pick<TeamRef, 'abbreviation' | 'logoUrl'>
  size?: number
  className?: string
  bold?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <TeamLogo team={team} size={size} />
      <span className={cn(bold && 'font-semibold')}>{team.abbreviation}</span>
    </span>
  )
}
