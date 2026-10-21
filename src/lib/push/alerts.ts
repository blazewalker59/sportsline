/**
 * Which Timeline items become Alerts (CONTEXT.md, "Alert") at each Alert
 * level, and what they say. Pure. Who receives them is decided in
 * deliver.ts; Prediction moments (odds, Legs, results) in predictionAlerts.ts.
 *
 * Every Alert's title leads with its source (FOLLOWING, PREDICTION,
 * FANTASY) and why it matters to the Viewer; the body carries the play.
 */

import type { TimelineItem } from '@/lib/model/timeline'
import { notableLead, scoringHeadline } from '@/lib/timeline/chat'
import { segmentDescription } from '@/lib/timeline/format'
import {
  BASKETBALL_MILESTONE_CREDIT,
  BASKETBALL_MILESTONE_LABEL,
  isBasketballMilestone,
} from '@/lib/fantasy/basketballMilestones'

/** An item older than this when first seen is history, not news. */
const STALE_MS = 15 * 60_000

type AlertSource = 'following' | 'prediction' | 'fantasy'

/** How much each source sends (CONTEXT.md, "Alert level"). */
export interface AlertLevels {
  /** Scores, Overturns and Finals; Finals only; or nothing. */
  following: 'scores' | 'finals' | 'off'
  /** Key moments (odds swings, Legs, results); plus every score; or nothing. */
  predictions: 'key' | 'scores' | 'off'
  /** Key events for both sides' Starters; the Viewer's own only; or nothing. */
  fantasy: 'key' | 'mine' | 'off'
}

export const DEFAULT_LEVELS: AlertLevels = {
  following: 'scores',
  predictions: 'key',
  fantasy: 'key',
}

export interface AlertMessage {
  title: string
  body: string
  /** Opens the Play (or Game, or Prediction) in the Timeline. */
  url: string
  /** Same tag: a newer Alert replaces the older one on the lock screen. */
  tag: string
  final: boolean
}

const LABEL: Record<AlertSource, string> = {
  following: 'FOLLOWING',
  prediction: 'PREDICTION',
  fantasy: 'FANTASY',
}

const fresh = (item: TimelineItem, now: number) =>
  now - Date.parse(item.occurredAt) < STALE_MS

const activePlay = (item: TimelineItem, now: number) =>
  item.kind === 'play' && item.status === 'active' && fresh(item, now)

/** NBA lead changes only interrupt in a close fourth quarter or overtime. */
function nbaClutch(item: TimelineItem): boolean {
  if (item.league !== 'nba') return true
  const late = /^(?:Q4|(?:\d+)?OT)\b/.test(item.segmentLabel)
  return late && Math.abs(item.score.away - item.score.home) <= 5
}

type ResolvedCredit = { id: string; credit: string }

function resolvedCredits(item: TimelineItem): ReadonlyArray<ResolvedCredit> {
  const detail = item.detail
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return []
  const credits = detail.credits
  if (!Array.isArray(credits)) return []
  return credits.filter((credit): credit is ResolvedCredit =>
    Boolean(
      credit &&
      typeof credit === 'object' &&
      !Array.isArray(credit) &&
      typeof credit.id === 'string' &&
      typeof credit.credit === 'string',
    ),
  )
}

function basketballMilestoneLabels(
  item: TimelineItem,
  playerId?: string,
): Array<string> {
  return resolvedCredits(item).flatMap((credit) => {
    if (playerId && credit.id !== playerId) return []
    if (!credit.credit.startsWith(BASKETBALL_MILESTONE_CREDIT)) return []
    const milestone = credit.credit.slice(BASKETBALL_MILESTONE_CREDIT.length)
    return isBasketballMilestone(milestone)
      ? [BASKETBALL_MILESTONE_LABEL[milestone]]
      : []
  })
}

/**
 * Could this item Alert anyone at any level? (Fresh Finals, Overturns,
 * Scoring Plays, and Fantasy big plays or NBA milestones.) LiveGame skips
 * the rest.
 */
export function isAlertCandidate(item: TimelineItem, now: number): boolean {
  if (!fresh(item, now)) return false
  if (item.kind === 'milestone') return item.milestone === 'final'
  if (item.kind === 'overturn') return nbaClutch(item)
  if (item.status !== 'active') return false
  const yards = (item.detail as { yards?: number | null } | null)?.yards ?? 0
  return (
    basketballMilestoneLabels(item).length > 0 ||
    (item.significance === 'scoring' && nbaClutch(item)) ||
    yards >= BIG_GAIN_YARDS
  )
}

/** For a Team or Player Follow: Scoring Plays, Overturns, Finals. */
export function isFollowingAlertable(
  item: TimelineItem,
  level: AlertLevels['following'],
  now: number,
): boolean {
  if (level === 'off' || !fresh(item, now)) return false
  if (item.kind === 'milestone') return item.milestone === 'final'
  if (level === 'finals') return false
  if (item.kind === 'overturn') return nbaClutch(item)
  return (
    item.significance === 'scoring' &&
    item.status === 'active' &&
    nbaClutch(item)
  )
}

/**
 * At the "every score" level, a Prediction's Game's Scoring Plays. (Its key
 * moments come from its odds and markets, not plays.)
 */
export function isPredictionPlayAlertable(
  item: TimelineItem,
  level: AlertLevels['predictions'],
  now: number,
): boolean {
  return (
    level === 'scores' &&
    activePlay(item, now) &&
    item.significance === 'scoring' &&
    nbaClutch(item)
  )
}

/** Roles that credit a Player with a play, by League (not holders, tacklers). */
const CREDITED: Partial<Record<TimelineItem['league'], ReadonlySet<string>>> = {
  nfl: new Set([
    'passer',
    'rusher',
    'receiver',
    'returner',
    'scorer',
    'patScorer',
    'kicker',
  ]),
  nba: new Set(['shooter']),
  mlb: new Set(['batter']),
}

/** A gain this long by a Starter is a big play for Fantasy. */
const BIG_GAIN_YARDS = 25

/**
 * A Fantasy key event for this Starter: their score, an NBA stat milestone,
 * or, for the Viewer's own Starter, a big play. Kickers count for field
 * goals, not extra points.
 */
export interface FantasyAlertEvent {
  kind: 'score' | 'big' | 'milestone'
  headline: string
}

export function fantasyEvent(
  item: TimelineItem,
  playerId: string,
  side: 'mine' | 'opponent',
  level: AlertLevels['fantasy'],
  now: number,
): FantasyAlertEvent | null {
  if (level === 'off' || (level === 'mine' && side === 'opponent')) return null
  if (!activePlay(item, now)) return null
  if (item.league === 'nba') {
    const labels = basketballMilestoneLabels(item, playerId)
    return labels.length > 0
      ? { kind: 'milestone', headline: labels.join(' · ') }
      : null
  }
  const credited = CREDITED[item.league === 'cfb' ? 'nfl' : item.league]
  const roles = item.players
    .filter((p) => p.id === playerId)
    .map((p) => p.role)
    .filter((r) => credited?.has(r))
  if (roles.length === 0) return null
  const fieldGoal = /Field Goal Good/i.test(item.playType ?? '')
  if (roles.every((r) => r === 'kicker') && !fieldGoal) return null
  if (item.significance === 'scoring')
    return { kind: 'score', headline: headline(item) }
  if (side === 'opponent') return null
  const yards = (item.detail as { yards?: number | null } | null)?.yards ?? 0
  return item.league === 'nfl' && yards >= BIG_GAIN_YARDS
    ? { kind: 'big', headline: `${yards} yards` }
    : null
}

function scoreLine(item: TimelineItem): string {
  return `${item.awayTeam.abbreviation} ${item.score.away}–${item.score.home} ${item.homeTeam.abbreviation}`
}

/** What happened, briefly: "Touchdown", "Home run", "38 yards". */
function headline(item: TimelineItem): string {
  if (item.kind === 'overturn' || item.significance === 'scoring')
    return scoringHeadline(item)
  return notableLead(item) ?? 'Big play'
}

function playText(item: TimelineItem): string {
  return segmentDescription(
    item.description.replace(/^Overturned: /, ''),
    item.league,
    item.players,
  )
    .map((s) => s.text)
    .join('')
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Why it matters, per source: the Prediction or the Starter. */
export type AlertReason =
  | { source: 'following' }
  | {
      source: 'prediction'
      prediction: string
      /** Opens the Timeline narrowed to this Prediction. */
      predictionId?: string
    }
  | {
      source: 'fantasy'
      side: 'mine' | 'opponent'
      player: string
      /** "Flex Gods 98–87". */
      matchup: string | null
      /** The Matchup's league row: opens the Timeline narrowed to it. */
      matchupId?: string
      event?: FantasyAlertEvent
    }

/**
 * A play's Alert. FOLLOWING · CLE touchdown / PREDICTION · Browns win: 63%
 * / FANTASY · Your Stafford · Touchdown, then the score and the play.
 */
export function alertMessage(
  item: TimelineItem,
  reason: AlertReason = { source: 'following' },
): AlertMessage {
  const day = `&day=${item.sportsDay}`
  const label = LABEL[reason.source]
  if (item.kind === 'milestone') {
    return {
      title: `${label} · Final`,
      body: item.description,
      url: `/?game=${encodeURIComponent(item.gameId)}${day}`,
      tag: item.gameId,
      final: true,
    }
  }
  const what =
    reason.source === 'fantasy' && reason.event
      ? reason.event.headline
      : headline(item)
  const where = `${scoreLine(item)} · ${item.segmentLabel}`
  const play = `&play=${encodeURIComponent(item.id)}${day}`
  // Each source opens its own view: the Game for a Follow, the Prediction
  // or the Matchup (in their Scopes) for the others, the Play over it.
  const url =
    reason.source === 'fantasy' && reason.matchupId
      ? `/?scope=fantasy&matchup=${encodeURIComponent(reason.matchupId)}${play}`
      : reason.source === 'prediction' && reason.predictionId
        ? `/?scope=predictions&prediction=${encodeURIComponent(reason.predictionId)}${play}`
        : `/?game=${encodeURIComponent(item.gameId)}${play}`
  const base = { url, tag: item.gameId, final: false }
  switch (reason.source) {
    case 'following': {
      const team = item.side
        ? (item.side === 'home' ? item.homeTeam : item.awayTeam).abbreviation
        : null
      return {
        ...base,
        title: `${label} · ${team ? `${team} ${lower(what)}` : what}`,
        body: `${where} · ${playText(item)}`,
      }
    }
    case 'prediction':
      return {
        ...base,
        title: `${label} · ${reason.prediction}`,
        body: `${what} · ${where} · ${playText(item)}`,
      }
    case 'fantasy':
      return {
        ...base,
        title: `${label} · ${reason.side === 'mine' ? 'Your' : 'Opp.'} ${reason.player} · ${what}`,
        body: [playText(item), scoreLine(item), reason.matchup]
          .filter(Boolean)
          .join(' · '),
      }
  }
}
