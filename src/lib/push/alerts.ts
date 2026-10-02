/**
 * Which Timeline items become Alerts (CONTEXT.md, "Alert") and what they
 * say. Pure. Who receives them is decided against Follows in deliver.ts.
 */

import type { TimelineItem } from '@/lib/model/timeline'
import { scoringHeadline } from '@/lib/timeline/chat'
import { segmentDescription } from '@/lib/timeline/format'

/** An item older than this when first seen is history, not news. */
const STALE_MS = 15 * 60_000

export interface AlertMessage {
  title: string
  body: string
  /** Opens the Play (or Game) in the Timeline. */
  url: string
  /** Same Game, same tag: a newer Alert replaces the older one on the lock screen. */
  tag: string
  final: boolean
}

export function isAlertable(item: TimelineItem, now: number): boolean {
  const news = now - Date.parse(item.occurredAt) < STALE_MS
  if (item.kind === 'overturn') return news
  if (item.kind === 'milestone') return item.milestone === 'final' && news
  // Basketball scores ~80 times a game: until NBA Scoring is narrowed (lead
  // changes, Clutch), only its Finals Alert.
  if (item.league === 'nba') return false
  return item.significance === 'scoring' && news && item.status === 'active'
}

function scoreLine(item: TimelineItem): string {
  return `${item.awayTeam.abbreviation} ${item.score.away}–${item.score.home} ${item.homeTeam.abbreviation}`
}

export function alertMessage(item: TimelineItem): AlertMessage {
  const day = `&day=${item.sportsDay}`
  if (item.kind === 'milestone') {
    return {
      title: item.description,
      body: 'Final',
      url: `/?game=${encodeURIComponent(item.gameId)}${day}`,
      tag: item.gameId,
      final: true,
    }
  }
  const text = segmentDescription(
    item.description.replace(/^Overturned: /, ''),
    item.league,
    item.players,
  )
    .map((s) => s.text)
    .join('')
  return {
    title: `${scoringHeadline(item)} · ${scoreLine(item)}`,
    body: text,
    url: `/?game=${encodeURIComponent(item.gameId)}&play=${encodeURIComponent(item.id)}${day}`,
    tag: item.gameId,
    final: false,
  }
}
