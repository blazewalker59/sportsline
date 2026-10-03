import { useState } from 'react'
import type { League } from '@/lib/model/types'
import { cn } from '@/lib/utils'

const LABELS: Record<League, string> = {
  mlb: 'MLB',
  nba: 'NBA',
  nfl: 'NFL',
  cfb: 'CFB',
  nhl: 'NHL',
}

// ESPN's dark-background league marks, resized (the originals are up to ~100 KB).
const LOGOS: Record<League, string> = {
  mlb: espn('mlb'),
  nba: espn('nba'),
  nfl: espn('nfl'),
  // ESPN has no college football league mark; the NCAA's reads on dark.
  cfb: 'https://a.espncdn.com/combiner/i?img=/i/espn/misc_logos/500/ncaa.png&w=80&h=80',
  nhl: espn('nhl'),
}

function espn(league: League): string {
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500-dark/${league}.png&w=80&h=80`
}

export function leagueLabel(league: League): string {
  return LABELS[league]
}

/** A League shown by its logo; the name is the accessible label and the fallback. */
export function LeagueLogo({
  league,
  size = 18,
  className,
}: {
  league: League
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span
        className={cn(
          'text-[11px] font-semibold uppercase tracking-wide text-muted',
          className,
        )}
      >
        {LABELS[league]}
      </span>
    )
  }
  return (
    <img
      src={LOGOS[league]}
      alt={LABELS[league]}
      title={LABELS[league]}
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
