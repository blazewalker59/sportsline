/**
 * A Game's flow (CONTEXT.md, "Game flow"): each team's score over the
 * Game, as stepped series in play order, the Scoring Plays as markers, and
 * where each segment (quarter, inning, period) begins. Pure.
 */

import type { League } from '@/lib/model/types'
import type { TimelineItem } from '@/lib/model/timeline'

export interface FlowStep {
  /** Play order: 0 is the start, each item one step. */
  x: number
  score: number
}

export interface FlowScore {
  x: number
  item: TimelineItem
  side: 'away' | 'home'
  /** The scoring team's score after the play. */
  score: number
}

export interface FlowSegment {
  x: number
  /** "Q2", "3", "P2", "OT". */
  label: string
}

export interface GameFlow {
  away: Array<FlowStep>
  home: Array<FlowStep>
  scores: Array<FlowScore>
  segments: Array<FlowSegment>
  /** The last x (the chart's right edge). */
  end: number
}

/** A segment's short name from its label: "Q2 4:31" → "Q2", "Top 3rd" → "3". */
export function segmentOf(label: string, league: League): string | null {
  const t = label.trim()
  if (!t) return null
  if (league === 'mlb') {
    const inning = /(?:top|bot|mid|end)\w*\s+(\d+)/i.exec(t)?.[1]
    return inning ?? null
  }
  if (/^(half|final|end of game)/i.test(t)) return null
  const first = t.split(/\s+/)[0]
  if (league === 'nhl') {
    const n = /^(\d)(?:st|nd|rd|th)$/i.exec(first)?.[1]
    if (n) return `P${n}`
  }
  return first.replace(/^End$/i, '') || null
}

/**
 * Stepped series from the Game's items (in order): a team's line holds
 * its score and steps at the play that changed it.
 */
export function buildFlow(
  items: ReadonlyArray<TimelineItem>,
  league: League,
): GameFlow {
  const away: Array<FlowStep> = [{ x: 0, score: 0 }]
  const home: Array<FlowStep> = [{ x: 0, score: 0 }]
  const scores: Array<FlowScore> = []
  const segments: Array<FlowSegment> = []
  let a = 0
  let h = 0
  let lastSegment: string | null = null
  const ordered = items.filter(
    (i) => i.kind !== 'overturn' && i.status === 'active',
  )
  ordered.forEach((item, index) => {
    const x = index + 1
    const segment = segmentOf(item.segmentLabel, league)
    if (segment && segment !== lastSegment) {
      segments.push({ x: x - 0.5, label: segment })
      lastSegment = segment
    }
    // A score never goes down: a stored correction that briefly lowers
    // one would draw as a spike, so each line holds its high mark.
    const na = Math.max(a, item.score.away)
    const nh = Math.max(h, item.score.home)
    if (na !== a) {
      away.push({ x, score: a }, { x, score: na })
      a = na
    }
    if (nh !== h) {
      home.push({ x, score: h }, { x, score: nh })
      h = nh
    }
    if (
      item.kind === 'play' &&
      item.significance === 'scoring' &&
      item.side !== null
    ) {
      scores.push({
        x,
        item,
        side: item.side,
        score: item.side === 'away' ? na : nh,
      })
    }
  })
  const end = Math.max(1, ordered.length)
  away.push({ x: end, score: a })
  home.push({ x: end, score: h })
  return { away, home, scores, segments, end }
}
