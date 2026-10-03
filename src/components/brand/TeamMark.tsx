import { useState } from 'react'
import type { TeamRef } from '@/lib/model/timeline'
import { lightLogo } from '@/lib/brand/logos'
import { cn } from '@/lib/utils'

/**
 * A Team's logo; renders nothing if there is none or it fails to load.
 * Shows the Source's light-background mark in light mode and its
 * dark-background mark in dark mode, unless `surface` fixes which one
 * (a logo on a team-color fill).
 */
export function TeamLogo({
  team,
  size = 18,
  className,
  surface,
}: {
  team: Pick<TeamRef, 'abbreviation' | 'logoUrl'>
  size?: number
  className?: string
  /** The background is light or dark whatever the theme. */
  surface?: 'light' | 'dark'
}) {
  const [failed, setFailed] = useState(false)
  const [lightFailed, setLightFailed] = useState(false)
  if (!team.logoUrl || failed) return null
  const light = lightFailed ? null : lightLogo(team.logoUrl)
  const img = (src: string, extra: string, onError: () => void) => (
    <img
      key={src}
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={onError}
      className={cn('shrink-0 object-contain', extra, className)}
      style={{ width: size, height: size }}
    />
  )
  const dark = () => setFailed(true)
  if (!light || surface === 'dark') return img(team.logoUrl, '', dark)
  if (surface === 'light') return img(light, '', () => setLightFailed(true))
  return (
    <>
      {img(light, 'dark:hidden', () => setLightFailed(true))}
      {img(team.logoUrl, 'hidden dark:block', dark)}
    </>
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
