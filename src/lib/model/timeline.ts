/**
 * Timeline items as stored and as Viewers receive them, and the rules that
 * decide which items a Viewer's Follows cover (CONTEXT.md, "Follow",
 * "Timeline"). Ids here are Sportsline ids, never Source ids.
 */

import { LEAGUES, isCollege } from './types'
import type { TeamColors } from '@/lib/brand/teamColors'
import type { Conference } from './leagues'
import type {
  Json,
  League,
  MilestoneKind,
  Side,
  Significance,
  Situation,
} from './types'

export interface TimelinePlayer {
  id: string
  name: string
  role: string
}

/** How a Team is shown wherever it appears: logo plus abbreviation. */
export interface TeamRef {
  id: string
  abbreviation: string
  logoUrl: string | null
  /** Primary/secondary brand colors, when known. */
  colors?: TeamColors | null
  /** College football: AP Top 25 rank at this Game, if ranked. */
  rank?: number | null
  /** College football: major conference at this Game, if any. */
  conference?: Conference | null
}

export interface TimelineItem {
  id: string
  gameId: string
  league: League
  sportsDay: string
  /** `overturn` is the news item surfaced when a Play is Overturned. */
  kind: 'play' | 'milestone' | 'overturn'
  /** The team whose action this Play is (null for Milestones and neutral Plays). */
  side: Side | null
  sequence: number
  occurredAt: string
  segmentLabel: string
  score: { away: number; home: number }
  awayTeam: TeamRef
  homeTeam: TeamRef
  description: string
  playType: string | null
  significance: Significance | null
  milestone: MilestoneKind | null
  /** `overturned` Plays stay visible, struck through. */
  status: 'active' | 'overturned'
  /** Set once a Revision has changed this item's facts. */
  revisedAt: string | null
  /** For an `overturn` item, the Play it overturns. */
  overturnOf: string | null
  players: Array<TimelinePlayer>
  detail: Json
}

export type Follow =
  | { kind: 'league'; league: League }
  | { kind: 'team'; teamId: string }
  | { kind: 'player'; playerId: string }
  /**
   * One Game, as a Prediction depends on it (the Predictions Scope, and a
   * college Game the Viewer opted into).
   */
  | { kind: 'game'; gameId: string }
  /**
   * The Starters, either side, in the Viewer's Fantasy Matchups (the
   * Fantasy Scope). The ids route live plays; the server reads the
   * Viewer's own Starters rather than trusting (or binding) the list.
   */
  | { kind: 'fantasy'; playerIds: ReadonlyArray<string> }

/** A Follow a Viewer can save (CONTEXT.md, "Follow"). */
export type ViewerFollow = Exclude<
  Follow,
  { kind: 'game' } | { kind: 'fantasy' }
>

export interface TimelineFilter {
  follows: Array<Follow>
  /** Narrow to one Game (CONTEXT.md: pinning a Game is a filter, not a Follow). */
  gameId?: string
  /** Show Routine Plays even for League Follows. */
  includeRoutine?: boolean
}

/** What a Viewer's socket receives as the Timeline changes. */
export type TimelineEvent =
  | { type: 'upsert'; item: TimelineItem }
  | { type: 'remove'; id: string; gameId: string }
  | { type: 'game'; game: GameSummary }

export interface GameSummary {
  id: string
  league: League
  sportsDay: string
  status: string
  startsAt: string
  awayTeam: TeamRef & { name: string }
  homeTeam: TeamRef & { name: string }
  score: { away: number; home: number }
  situation: Situation | null
}

/**
 * Does this item belong on a Timeline with these Follows?
 *
 * A Team Follow covers every item in that Team's Games; a Player Follow only
 * Plays naming that player; a League Follow every item in the League, but
 * Routine Plays only when asked for. Game Milestones show for every Follow
 * that covers their Game.
 */
export function matchesFilter(
  item: TimelineItem,
  filter: TimelineFilter,
): boolean {
  if (filter.gameId) return item.gameId === filter.gameId
  return filter.follows.some((follow) => {
    switch (follow.kind) {
      case 'team':
        return (
          item.awayTeam.id === follow.teamId ||
          item.homeTeam.id === follow.teamId
        )
      case 'player':
        return (
          item.kind !== 'milestone' &&
          item.players.some((p) => p.id === follow.playerId)
        )
      case 'league':
        if (item.league !== follow.league) return false
        return (
          item.kind !== 'play' ||
          item.significance !== 'routine' ||
          Boolean(filter.includeRoutine)
        )
      case 'fantasy':
        return (
          item.kind !== 'milestone' &&
          item.players.some((p) => follow.playerIds.includes(p.id))
        )
      case 'game':
        if (item.gameId !== follow.gameId) return false
        return (
          item.kind !== 'play' ||
          item.significance !== 'routine' ||
          Boolean(filter.includeRoutine)
        )
    }
  })
}

/** `league:mlb,team:tm_x,player:pl_y,game:gm_z` ↔ Follows (URL and socket form). */
export function followsToParam(follows: ReadonlyArray<Follow>): string {
  return follows
    .map((f) =>
      f.kind === 'league'
        ? `league:${f.league}`
        : f.kind === 'team'
          ? `team:${f.teamId}`
          : f.kind === 'player'
            ? `player:${f.playerId}`
            : f.kind === 'game'
              ? `game:${f.gameId}`
              : `fantasy:${f.playerIds.join('|')}`,
    )
    .join(',')
}

export function followsFromParam(
  param: string | null | undefined,
): Array<Follow> {
  if (!param) return []
  return param.split(',').flatMap((part): Array<Follow> => {
    const [kind, value = ''] = part.split(':')
    if (!value && kind !== 'fantasy') return []
    if (
      kind === 'league' &&
      (LEAGUES as ReadonlyArray<string>).includes(value)
    ) {
      return [{ kind: 'league', league: value as League }]
    }
    if (kind === 'team' && /^tm_\w+$/.test(value))
      return [{ kind: 'team', teamId: value }]
    if (kind === 'player' && /^pl_\w+$/.test(value))
      return [{ kind: 'player', playerId: value }]
    if (kind === 'fantasy')
      return [
        {
          kind: 'fantasy',
          playerIds: value.split('|').filter((id) => /^pl_\w+$/.test(id)),
        },
      ]
    if (kind === 'game' && /^gm_\w+$/.test(value))
      return [{ kind: 'game', gameId: value }]
    return []
  })
}

/**
 * Every League but the college ones (Scoring and Notable only by default):
 * a college Game is followed only when the Viewer opts into it.
 */
export const DEFAULT_FOLLOWS: ReadonlyArray<Follow> = LEAGUES.filter(
  (league) => !isCollege(league),
).map((league) => ({ kind: 'league' as const, league }))
