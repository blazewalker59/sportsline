/**
 * Which Timeline items become Alerts (CONTEXT.md, "Alert") and what they
 * say. Pure. Who receives them is decided against Follows in deliver.ts.
 */

import type { TimelineItem } from '@/lib/model/timeline'
import { notableLead, scoringHeadline } from '@/lib/timeline/chat'
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

/**
 * Alertable for a Viewer with an open Prediction on the Game: every
 * Scoring and Notable Play (CONTEXT.md, "Alert").
 */
export function isPredictionAlertable(
  item: TimelineItem,
  now: number,
): boolean {
  return (
    item.kind === 'play' &&
    (item.significance === 'scoring' || item.significance === 'notable') &&
    item.status === 'active' &&
    now - Date.parse(item.occurredAt) < STALE_MS
  )
}

export function isAlertable(item: TimelineItem, now: number): boolean {
  const news = now - Date.parse(item.occurredAt) < STALE_MS
  if (item.kind === 'overturn') return news
  if (item.kind === 'milestone') return item.milestone === 'final' && news
  return item.significance === 'scoring' && news && item.status === 'active'
}

function scoreLine(item: TimelineItem): string {
  return `${item.awayTeam.abbreviation} ${item.score.away}–${item.score.home} ${item.homeTeam.abbreviation}`
}

/**
 * A Scoring Play or Overturn leads with what scored ("Home run"); a Notable
 * one (a Prediction's Alert) with what happened ("Stolen base"), never a
 * score that didn't happen.
 */
function headline(item: TimelineItem): string {
  if (item.kind === 'overturn' || item.significance === 'scoring')
    return scoringHeadline(item)
  return notableLead(item) ?? 'Big play'
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
    title: `${headline(item)} · ${scoreLine(item)}`,
    body: text,
    url: `/?game=${encodeURIComponent(item.gameId)}&play=${encodeURIComponent(item.id)}${day}`,
    tag: item.gameId,
    final: false,
  }
}
