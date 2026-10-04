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

/** An item older than this when first seen is history, not news. */
const STALE_MS = 15 * 60_000

export type AlertSource = 'following' | 'prediction' | 'fantasy'

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

/**
 * Could this item Alert anyone at any level? (Fresh Finals, Overturns,
 * Scoring Plays, and long gains for Fantasy.) LiveGame skips the rest.
 */
export function isAlertCandidate(item: TimelineItem, now: number): boolean {
  if (!fresh(item, now)) return false
  if (item.kind === 'milestone') return item.milestone === 'final'
  if (item.kind === 'overturn') return true
  if (item.status !== 'active') return false
  const yards = (item.detail as { yards?: number | null } | null)?.yards ?? 0
  return item.significance === 'scoring' || yards >= BIG_GAIN_YARDS
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
  if (item.kind === 'overturn') return true
  return item.significance === 'scoring' && item.status === 'active'
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
    item.significance === 'scoring'
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
 * A Fantasy key event for this Starter: their score ("score"), or, for the
 * Viewer's own Starter, a big play ("big"). Kickers count for field goals,
 * not extra points.
 */
export function fantasyEvent(
  item: TimelineItem,
  playerId: string,
  side: 'mine' | 'opponent',
  level: AlertLevels['fantasy'],
  now: number,
): 'score' | 'big' | null {
  if (level === 'off' || (level === 'mine' && side === 'opponent')) return null
  if (!activePlay(item, now)) return null
  const credited = CREDITED[item.league === 'cfb' ? 'nfl' : item.league]
  const roles = item.players
    .filter((p) => p.id === playerId)
    .map((p) => p.role)
    .filter((r) => credited?.has(r))
  if (roles.length === 0) return null
  const fieldGoal = /Field Goal Good/i.test(item.playType ?? '')
  if (roles.every((r) => r === 'kicker') && !fieldGoal) return null
  if (item.significance === 'scoring') return 'score'
  if (side === 'opponent') return null
  const yards = (item.detail as { yards?: number | null } | null)?.yards ?? 0
  return item.league === 'nfl' && yards >= BIG_GAIN_YARDS ? 'big' : null
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
  const what = headline(item)
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
