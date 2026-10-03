import { useState } from 'react'
import { TeamLogo } from './TeamMark'
import type { TeamRef } from '@/lib/model/timeline'
import { cn } from '@/lib/utils'

/**
 * A Player's headshot in a circle, with their Team's logo as a badge.
 * Falls back to initials when there's no headshot or it fails to load.
 */
export function PlayerAvatar({
  name,
  headshotUrl,
  team,
  size = 40,
  className,
}: {
  name: string
  headshotUrl: string | null | undefined
  team?: Pick<TeamRef, 'abbreviation' | 'logoUrl'> | null
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const badge = Math.round(size * 0.42)
  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full border border-bubble-border bg-surface">
        {headshotUrl && !failed ? (
          <img
            src={headshotUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="size-full object-cover object-top"
          />
        ) : (
          <span
            className="font-bold text-muted"
            style={{ fontSize: Math.round(size * 0.36) }}
          >
            {initials(name)}
          </span>
        )}
      </span>
      {team?.logoUrl && (
        <span
          className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full border border-bubble-border bg-surface"
          style={{ width: badge, height: badge }}
        >
          <TeamLogo team={team} size={Math.round(badge * 0.78)} />
        </span>
      )}
    </span>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)![0] : '')
  ).toUpperCase()
}
