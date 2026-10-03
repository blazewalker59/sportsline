/**
 * What ESPN's site API looks like the same across Leagues (NFL, college
 * football and NBA all use it): game status, quarter labels, team identity and logos, and
 * the daily scoreboard.
 */

import type { EspnCompetitor, EspnStatus, NflScoreboard } from '../nfl/feed'
import type {
  GameStatus,
  League,
  ScheduledGame,
  SourceTeam,
} from '@/lib/model/types'
import type { Conference } from '@/lib/model/leagues'
import { sportsDayOf } from '@/lib/model/sportsDay'

export type EspnLeague = Extract<League, 'nfl' | 'cfb' | 'nba'>

export function mapStatus(status: EspnStatus | undefined): GameStatus {
  const name = status?.type?.name ?? ''
  if (/POSTPONED|CANCELED|CANCELLED/.test(name)) return 'postponed'
  if (/DELAY|SUSPENDED/.test(name)) return 'delayed'
  switch (status?.type?.state) {
    case 'in':
      return 'live'
    case 'post':
      return 'final'
    default:
      return 'scheduled'
  }
}

export function quarterLabel(period: number): string {
  return period <= 4 ? `Q${period}` : period === 5 ? 'OT' : `${period - 4}OT`
}

/** ESPN's dark-background logo, resized: the originals are ~100 KB PNGs. */
export function espnLogo(path: string): string {
  return `https://a.espncdn.com/combiner/i?img=${path}&w=80&h=80`
}

/** College logos are keyed by team id; the pros' by abbreviation. */
/** An ESPN headshot (350×254 originals), resized for avatars. */
export function espnHeadshot(href: string | undefined): string | null {
  if (!href) return null
  const path = href.replace(/^https?:\/\/a\.espncdn\.com/, '')
  return `https://a.espncdn.com/combiner/i?img=${path}&w=128&h=93`
}

export function teamLogo(
  league: EspnLeague,
  abbreviation: string,
  teamId: string,
): string {
  if (league === 'cfb')
    return espnLogo(`/i/teamlogos/ncaa/500-dark/${teamId}.png`)
  return espnLogo(
    `/i/teamlogos/${league}/500-dark/${abbreviation.toLowerCase()}.png`,
  )
}

export function competitorTeam(
  league: EspnLeague,
  c: EspnCompetitor,
): SourceTeam {
  const abbreviation = c.team.abbreviation ?? c.team.id
  return {
    sourceId: c.team.id,
    name: c.team.displayName ?? c.team.name ?? c.team.id,
    abbreviation,
    logoUrl: teamLogo(league, abbreviation, c.team.id),
    ...(league === 'cfb'
      ? { rank: top25(c), conference: conferenceOf(c) }
      : {}),
  }
}

/** ESPN's group ids for the major conferences. */
const CONFERENCE_IDS: Record<string, Conference> = {
  '8': 'sec',
  '5': 'big10',
  '4': 'big12',
  '1': 'acc',
}

/** A college team's major conference, or null for any other. */
export function conferenceOf(c: EspnCompetitor): Conference | null {
  const id = c.team.conferenceId ?? c.team.groups?.id
  return (id && CONFERENCE_IDS[id]) || null
}

/** A college team's AP Top 25 rank, or null when unranked. */
export function top25(c: EspnCompetitor): number | null {
  const rank = c.curatedRank?.current ?? c.rank
  return rank !== undefined && rank >= 1 && rank <= 25 ? rank : null
}

/** The numeric id at the end of an ESPN `$ref` path segment, e.g. `/athletes/8439`. */
export function refId(ref: string | undefined, kind: string): string | null {
  return ref?.match(new RegExp(`/${kind}/(\\d+)`))?.[1] ?? null
}

export function parseScoreboard(
  scoreboard: NflScoreboard,
  league: EspnLeague,
): Array<ScheduledGame> {
  return (scoreboard.events ?? []).flatMap((e) => {
    const competitors = e.competitions?.[0]?.competitors ?? []
    const a = competitors.find((c) => c.homeAway === 'away')
    const h = competitors.find((c) => c.homeAway === 'home')
    if (!a || !h) return []
    return [
      {
        league,
        sourceGameId: e.id,
        status: mapStatus(e.status),
        startsAt: e.date,
        sportsDay: sportsDayOf(new Date(e.date)),
        away: competitorTeam(league, a),
        home: competitorTeam(league, h),
        score: { away: Number(a.score ?? 0), home: Number(h.score ?? 0) },
      },
    ]
  })
}
