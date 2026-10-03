import { useState } from 'react'
import { LeagueLogo, leagueLabel } from './LeagueLogo'
import type { Conference, RowItem } from '@/lib/model/leagues'
import { isConference, isLeague } from '@/lib/model/leagues'
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

/** A short name: "NFL", "Top 25", "Big Ten". */
export function rowItemLabel(item: RowItem): string {
  if (isLeague(item)) return leagueLabel(item)
  if (isConference(item)) return CONFERENCE_NAMES[item]
  return 'Top 25'
}

/** A longer name for lists: "College Football", "SEC". */
export function rowItemName(item: RowItem): string {
  return item === 'cfb' ? 'College Football' : rowItemLabel(item)
}

function conferenceLogo(conference: Conference, variant: '500' | '500-dark') {
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa_conf/${variant}/${CONFERENCE_LOGO_IDS[conference]}.png&w=80&h=80`
}

/**
 * A Scope-row item as it appears on the row: a League's or Conference's
 * logo (the Conference's light or dark mark to suit the theme), or "Top 25".
 */
export function RowItemMark({
  item,
  size = 20,
  inverse,
}: {
  item: RowItem
  size?: number
  /** On an inverted chip (a selected Scope): use the other theme's mark. */
  inverse?: boolean
}) {
  const [failed, setFailed] = useState(false)
  if (isLeague(item)) return <LeagueLogo league={item} size={size} />
  if (isConference(item) && !failed) {
    const img = (variant: '500' | '500-dark', className: string) => (
      <img
        src={conferenceLogo(item, variant)}
        alt={CONFERENCE_NAMES[item]}
        title={CONFERENCE_NAMES[item]}
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
        {img(inverse ? '500-dark' : '500', 'dark:hidden')}
        {img(inverse ? '500' : '500-dark', 'hidden dark:block')}
      </>
    )
  }
  return (
    <span className="text-[13px] font-semibold whitespace-nowrap">
      {rowItemLabel(item)}
    </span>
  )
}
