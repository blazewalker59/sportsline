/**
 * Which team each named player is on, and the short "who did what" line for
 * Scoring bubbles. A Play records only its acting team (`side`); a player's
 * team follows from their role (a tackler, fielder, goalie or "drawn by"
 * player is on the other side). Pure.
 */

import type { TimelineItem, TimelinePlayer } from '@/lib/model/timeline'
import type { League, Side } from '@/lib/model/types'

/** Roles played by the side opposite the Play's acting team, per League. */
const OPPONENT_ROLES: Record<League, ReadonlySet<string>> = {
  nfl: new Set([
    'tackler',
    'sackedBy',
    'sacker',
    'interceptor',
    'defender',
    'forcedBy',
    'returner',
    'blocker',
  ]),
  mlb: new Set(['pitcher', 'fielder']),
  // NHL records a blocked shot under the blocking team: there the shooter
  // is the opponent (see playerSide).
  nhl: new Set(['goalie', 'loser', 'hittee', 'drew penalty']),
  nba: new Set(['blocker', 'steal']),
}

export function playerSide(
  item: TimelineItem,
  player: Pick<TimelinePlayer, 'role'>,
): Side | null {
  if (!item.side) return null
  const other: Side = item.side === 'home' ? 'away' : 'home'
  if (item.league === 'nhl' && item.playType === 'blocked-shot') {
    return player.role === 'shooter' ? other : item.side
  }
  return OPPONENT_ROLES[item.league].has(player.role) ? other : item.side
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : name
}

function byRole(
  item: TimelineItem,
  ...roles: Array<string>
): Array<TimelinePlayer> {
  return item.players.filter((p) => roles.includes(p.role))
}

/** A Scoring Play's short "who did what" line, or null when there's no good one. */
export function scoringSummary(item: TimelineItem): string | null {
  const text = item.description
  const first = (...roles: Array<string>) => byRole(item, ...roles)[0]
  switch (item.league) {
    case 'nfl': {
      const yards = text.match(/for (-?\d+) yards?/)?.[1]
      const passer = first('passer')
      const receiver = first('receiver')
      if (passer && receiver)
        return `${lastName(passer.name)} → ${lastName(receiver.name)}${yards ? ` · ${yards} yds` : ''}`
      const rusher = first('rusher')
      if (rusher)
        return `${lastName(rusher.name)}${yards ? ` · ${yards}-yd run` : ''}`
      const kicker = first('kicker')
      const fg = text.match(/(\d+) yard field goal/)?.[1]
      if (kicker && fg) return `${lastName(kicker.name)} · ${fg}-yd field goal`
      const returner = first('interceptor', 'returner')
      if (returner)
        return `${lastName(returner.name)}${yards ? ` · ${yards}-yd return` : ''}`
      return null
    }
    case 'mlb': {
      const batter = first('batter')
      const verb = text.match(
        /\b(homers|singles|doubles|triples|walks|out on a sacrifice fly|grounds out|flies out|lines out|pops out|reaches on [a-z ]+ error|is hit by pitch)\b/,
      )?.[1]
      // Runners who crossed the plate, from the Play's named players.
      const scored = item.players
        .filter((p) => text.includes(`${p.name} scores`))
        .map((p) => lastName(p.name))
      const lead = batter
        ? `${lastName(batter.name)}${verb ? ` ${verb.replace('out on a sacrifice fly', 'sac fly')}` : ''}`
        : null
      const runners = scored.filter(
        (n) => !batter || n !== lastName(batter.name),
      )
      if (!lead)
        return runners.length
          ? `${runners.join(', ')} ${runners.length > 1 ? 'score' : 'scores'}`
          : null
      return runners.length
        ? `${lead} · ${runners.join(', ')} ${runners.length > 1 ? 'score' : 'scores'}`
        : lead
    }
    case 'nhl': {
      const scorer = first('scorer')
      if (!scorer) return null
      const count = text.match(/\((\d+)\)/)?.[1]
      const assists = byRole(item, 'assist').map((p) => lastName(p.name))
      return `${lastName(scorer.name)}${count ? ` (${count})` : ''}${assists.length ? ` · ${assists.join(', ')}` : ' · unassisted'}`
    }
    case 'nba': {
      const shooter = first('shooter', 'player')
      if (!shooter) return null
      const feet = text.match(/(\d+)-foot/)?.[1]
      const assist = first('assist')
      return `${lastName(shooter.name)}${feet ? ` · ${feet} ft` : ''}${assist ? ` · ast ${lastName(assist.name)}` : ''}`
    }
  }
}
