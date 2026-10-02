import { Link } from '@tanstack/react-router'
import { timeAgo } from './format'
import type { TimelineItem } from '@/lib/model/timeline'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { cn } from '@/lib/utils'

interface MlbPlayDetail {
  pitches?: Array<unknown>
  hit?: {
    exitVelocity: number | null
    launchAngle: number | null
    distance: number | null
  } | null
}

export function TimelineItemCard({
  item,
  now,
}: {
  item: TimelineItem
  now: number
}) {
  if (item.kind === 'milestone') return <MilestoneRow item={item} now={now} />

  const overturn = item.kind === 'overturn'
  const struck = item.status === 'overturned'
  const accent = overturn
    ? 'border-l-live'
    : item.significance === 'scoring'
      ? 'border-l-scoring'
      : item.significance === 'notable'
        ? 'border-l-notable'
        : 'border-l-border'

  return (
    <Link to="/plays/$playId" params={{ playId: item.id }} className="block">
      <article
        className={cn(
          'rounded-xl border border-border border-l-4 bg-surface px-4 py-3 transition-colors hover:border-foreground/30',
          accent,
          struck && 'opacity-60',
        )}
      >
        <header className="mb-1 flex items-center gap-2 text-xs text-muted">
          <LeagueLogo league={item.league} size={16} />
          <Matchup item={item} />
          <span>·</span>
          <span>{item.segmentLabel}</span>
          <span className="ml-auto tabular-nums">
            {timeAgo(item.occurredAt, now)}
          </span>
        </header>
        {overturn && (
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-live">
            Overturned
          </p>
        )}
        <p className={cn('leading-snug', struck && 'line-through')}>
          {overturn
            ? item.description.replace(/^Overturned: /, '')
            : item.description}
        </p>
        <Footer item={item} />
      </article>
    </Link>
  )
}

function Matchup({ item }: { item: TimelineItem }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums text-foreground/90">
      <TeamLogo team={item.awayTeam} size={16} />
      {item.awayTeam.abbreviation} {item.score.away}
      <span className="text-muted">–</span>
      {item.score.home} {item.homeTeam.abbreviation}
      <TeamLogo team={item.homeTeam} size={16} />
    </span>
  )
}

function Footer({ item }: { item: TimelineItem }) {
  const bits: Array<string> = []
  if (item.league === 'mlb' && item.detail && typeof item.detail === 'object') {
    const detail = item.detail as MlbPlayDetail
    const hit = detail.hit
    if (hit?.exitVelocity) bits.push(`${hit.exitVelocity.toFixed(1)} mph`)
    if (hit?.launchAngle != null) bits.push(`${hit.launchAngle}°`)
    if (hit?.distance) bits.push(`${hit.distance} ft`)
    const pitches = detail.pitches?.length ?? 0
    if (pitches > 0) bits.push(`${pitches} pitch${pitches === 1 ? '' : 'es'}`)
  }
  if (bits.length === 0 && !item.revisedAt) return null
  return (
    <footer className="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-muted">
      {bits.length > 0 && <span>{bits.join(' · ')}</span>}
      {item.revisedAt && item.status === 'active' && (
        <span className="ml-auto rounded border border-border px-1.5 font-sans">
          Updated
        </span>
      )}
    </footer>
  )
}

function MilestoneRow({ item, now }: { item: TimelineItem; now: number }) {
  const strong = item.milestone === 'final' || item.milestone === 'start'
  return (
    <Link
      to="/games/$gameId"
      params={{ gameId: item.gameId }}
      className="flex items-center gap-3 py-1 text-xs text-muted hover:text-foreground"
    >
      <span className="h-px flex-1 bg-border" />
      <span
        className={cn(
          'text-center',
          strong && 'font-semibold text-foreground/90',
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <LeagueLogo league={item.league} size={14} />
          {item.description}
        </span>
      </span>
      <span className="tabular-nums">{timeAgo(item.occurredAt, now)}</span>
      <span className="h-px flex-1 bg-border" />
    </Link>
  )
}
