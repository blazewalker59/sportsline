import { useState } from 'react'
import { LeagueLogo, leagueLabel } from './LeagueLogo'
import type { Conference, RowItem } from '@/lib/model/leagues'
import { cn } from '@/lib/utils'

const CONFERENCE_NAMES: Record<Conference, string> = {
  sec: 'SEC',
  big10: 'Big Ten',
  big12: 'Big 12',
  acc: 'ACC',
}

/** ESPN's group id for each Conference, for its logo. */
const CONFERENCE_LOGO_IDS: Record<Conference, number> = {
  sec: 8,
  big10: 5,
  big12: 4,
  acc: 1,
}

/** A short name for the League row: "NFL", "CFB". */
export function rowItemLabel(item: RowItem): string {
  return leagueLabel(item)
}

const NAMES: Partial<Record<RowItem, string>> = {
  cfb: 'College Football',
  cbb: 'College Basketball',
}

/** A longer name for lists: "College Football", "NFL". */
export function rowItemName(item: RowItem): string {
  return NAMES[item] ?? rowItemLabel(item)
}

/** A League as it appears on the League row: its logo. */
export function RowItemMark({
  item,
  size = 20,
}: {
  item: RowItem
  size?: number
}) {
  return <LeagueLogo league={item} size={size} />
}

/** A college Conference's name: "SEC", "Big Ten". */
export function conferenceName(conference: Conference): string {
  return CONFERENCE_NAMES[conference]
}

function conferenceLogo(conference: Conference, variant: '500' | '500-dark') {
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa_conf/${variant}/${CONFERENCE_LOGO_IDS[conference]}.png&w=80&h=80`
}

/**
 * A college Team's Conference, beside its name on its page: the
 * Conference's logo (its light or dark mark to suit the theme), or its
 * name when the logo won't load.
 */
export function ConferenceMark({
  conference,
  size = 20,
}: {
  conference: Conference
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <span className="text-[13px] font-semibold whitespace-nowrap">
        {CONFERENCE_NAMES[conference]}
      </span>
    )
  const img = (variant: '500' | '500-dark', className: string) => (
    <img
      src={conferenceLogo(conference, variant)}
      alt={CONFERENCE_NAMES[conference]}
      title={CONFERENCE_NAMES[conference]}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  )
  return (
    <>
      {img('500', 'dark:hidden')}
      {img('500-dark', 'hidden dark:block')}
    </>
  )
}
