/**
 * The group-chat presentation of the Timeline and of a Game's thread
 * (design direction "Watch Party"). Pure: turns ordered TimelineItems into
 * clusters of bubbles from one team, folded runs of Routine Plays, and
 * centered notices.
 */

import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import type { Side } from '@/lib/model/types'

export type Bubble =
  | { type: 'play'; item: TimelineItem }
  | { type: 'fold'; id: string; items: Array<TimelineItem> }

export type FeedEntry =
  | { type: 'notice'; item: TimelineItem }
  | {
      type: 'cluster'
      id: string
      gameId: string
      side: Side
      bubbles: Array<Bubble>
    }

/** A run of this many Routine Plays (or more) folds into one "+N plays" bubble. */
export const MIN_FOLD = 2

/**
 * Group items (already in display order) into chat clusters: consecutive
 * Plays by the same team in the same Game share one avatar. Milestones and
 * Plays with no acting team are notices.
 */
export function buildChat(
  items: ReadonlyArray<TimelineItem>,
  options: { fold: boolean },
): Array<FeedEntry> {
  const entries: Array<FeedEntry> = []
  for (const item of items) {
    if (item.kind === 'milestone' || !item.side) {
      entries.push({ type: 'notice', item })
      continue
    }
    const last = entries.at(-1)
    if (
      last?.type === 'cluster' &&
      last.gameId === item.gameId &&
      last.side === item.side
    ) {
      last.bubbles.push({ type: 'play', item })
    } else {
      entries.push({
        type: 'cluster',
        id: item.id,
        gameId: item.gameId,
        side: item.side,
        bubbles: [{ type: 'play', item }],
      })
    }
  }
  if (options.fold) {
    for (const e of entries)
      if (e.type === 'cluster') e.bubbles = foldRoutine(e.bubbles)
  }
  return entries
}

function isRoutine(b: Bubble): boolean {
  return (
    b.type === 'play' &&
    b.item.kind === 'play' &&
    b.item.significance === 'routine'
  )
}

function foldRoutine(bubbles: Array<Bubble>): Array<Bubble> {
  const out: Array<Bubble> = []
  let run: Array<TimelineItem> = []
  const flush = () => {
    if (run.length >= MIN_FOLD)
      out.push({ type: 'fold', id: `fold:${run[0].id}`, items: run })
    else out.push(...run.map((item) => ({ type: 'play' as const, item })))
    run = []
  }
  for (const b of bubbles) {
    if (isRoutine(b) && b.type === 'play') run.push(b.item)
    else {
      flush()
      out.push(b)
    }
  }
  flush()
  return out
}

interface Detail {
  strength?: string | null
  yards?: number | null
  down?: number | null
}

function detailOf(item: TimelineItem): Detail {
  return item.detail &&
    typeof item.detail === 'object' &&
    !Array.isArray(item.detail)
    ? (item.detail as Detail)
    : {}
}

const MLB_HIT_SCORING: Record<string, string> = {
  single: 'RBI single',
  double: 'RBI double',
  triple: 'RBI triple',
  sac_fly: 'Sac fly',
  sac_bunt: 'Sac bunt',
  field_error: 'Run scores on an error',
  wild_pitch: 'Run scores on a wild pitch',
  passed_ball: 'Run scores on a passed ball',
  balk: 'Run scores on a balk',
  walk: 'Run walks in',
  hit_by_pitch: 'Run scores, hit by pitch',
}

/** The big line on a Scoring bubble ("Touchdown", "Power-play goal"…). */
export function scoringHeadline(item: TimelineItem): string {
  if (item.kind === 'overturn') return 'Overturned'
  const type = item.playType ?? ''
  switch (item.league) {
    case 'nfl':
      if (type === 'Interception Return Touchdown') return 'Pick six'
      if (type.includes('Touchdown')) return 'Touchdown'
      if (type === 'Field Goal Good') return 'Field goal'
      if (type === 'Safety') return 'Safety'
      return 'Score'
    case 'mlb':
      if (type === 'home_run') return 'Home run'
      return MLB_HIT_SCORING[type] ?? 'Run scores'
    case 'nhl': {
      const strength = detailOf(item).strength
      if (strength === 'power play') return 'Power-play goal'
      if (strength === 'shorthanded') return 'Shorthanded goal'
      if (strength === 'empty net') return 'Empty-net goal'
      return 'Goal'
    }
    case 'nba': {
      const points = (detailOf(item) as { points?: number }).points ?? 0
      if (/Free Throw/i.test(type)) return 'Free throw'
      if (points === 3) return 'Three-pointer'
      if (/Dunk/i.test(type)) return 'Dunk'
      if (/Layup|Finger Roll/i.test(type)) return 'Layup'
      return 'Bucket'
    }
  }
}

/** A short bold lead for a Notable bubble ("Sack.", "36 yards."), or null. */
export function notableLead(item: TimelineItem): string | null {
  if (item.significance !== 'notable') return null
  const type = item.playType ?? ''
  const d = detailOf(item)
  switch (item.league) {
    case 'nfl':
      if (type === 'Sack') return 'Sack'
      if (type === 'Pass Interception Return') return 'Interception'
      if (type.startsWith('Fumble')) return 'Fumble'
      if (type === 'Field Goal Missed') return 'No good'
      if (type.startsWith('Blocked')) return 'Blocked'
      if (d.yards && d.yards >= 20) return `${d.yards} yards`
      if (d.down === 4) return '4th down'
      return null
    case 'mlb':
      if (type.startsWith('stolen_base')) return 'Stolen base'
      if (
        type.startsWith('caught_stealing') ||
        type.startsWith('pickoff_caught')
      )
        return 'Caught stealing'
      if (type.startsWith('pickoff')) return 'Picked off'
      if (type.includes('double_play')) return 'Double play'
      if (type === 'triple_play') return 'Triple play'
      if (type === 'double') return 'Double'
      if (type === 'triple') return 'Triple'
      return null
    case 'nhl':
      if (type === 'fight') return 'Fight'
      if (type === 'penalty') return 'Penalty'
      return null
    case 'nba': {
      const text = item.description
      if (/\bblocks\b/.test(text)) return 'Block'
      if (/\bsteals\)/.test(text)) return 'Steal'
      if (/flagrant/i.test(type)) return 'Flagrant'
      if (/technical/i.test(type)) return 'Technical'
      if (/challenge|review/i.test(type)) return 'Review'
      if (/jump ?ball/i.test(type)) return 'Jump ball'
      return null
    }
  }
}

/** Who is "typing" in a live Game, and what the typing indicator says. */
export interface Typing {
  gameId: string
  /** The team with the ball / at bat, or null when neither (hockey). */
  side: Side | null
  text: string
}

interface MlbSituation {
  outs?: number
  onFirst?: boolean
  onSecond?: boolean
  onThird?: boolean
  batter?: string | null
}
interface NflSituation {
  downDistance?: string | null
  possession?: string | null
}
interface NhlSituation {
  strength?: string | null
}

export function typingFor(game: GameSummary): Typing | null {
  if (game.status !== 'live' || !game.situation) return null
  const label = game.situation.segmentLabel
  const detail = (game.situation.detail ?? {}) as MlbSituation &
    NflSituation &
    NhlSituation
  switch (game.league) {
    case 'mlb': {
      const side: Side | null = label.startsWith('Top')
        ? 'away'
        : label.startsWith('Bot')
          ? 'home'
          : null
      const outs = detail.outs ?? 0
      const on = [
        detail.onFirst && '1st',
        detail.onSecond && '2nd',
        detail.onThird && '3rd',
      ].filter(Boolean)
      const parts = [
        label,
        `${outs} out`,
        on.length ? `on ${on.join(' & ')}` : null,
        detail.batter ? `${detail.batter} up` : null,
      ]
      return { gameId: game.id, side, text: parts.filter(Boolean).join(' · ') }
    }
    case 'nfl': {
      const side: Side | null =
        detail.possession === game.homeTeam.abbreviation
          ? 'home'
          : detail.possession === game.awayTeam.abbreviation
            ? 'away'
            : null
      return {
        gameId: game.id,
        side,
        text: [detail.downDistance, label].filter(Boolean).join(' · '),
      }
    }
    case 'nhl':
      return {
        gameId: game.id,
        side: null,
        text: [label, detail.strength].filter(Boolean).join(' · '),
      }
    case 'nba':
      return { gameId: game.id, side: null, text: label }
  }
}

/** Relative luminance (WCAG) of a `#rrggbb` color, 0–1; null if unparseable. */
export function luminance(hex: string): number | null {
  const m = hex
    .replace('#', '')
    .match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Readable text on a team-color fill: near-black on light colors, white on dark. */
export function textOn(hex: string): string {
  const l = luminance(hex)
  if (l === null) return '#ffffff'
  return l > 0.4 ? '#111318' : '#ffffff'
}

/**
 * The colors a team's bubbles are washed with: its primary on a light
 * ground; on a dark ground whichever of its two colors is brighter, since
 * navy, black and brown primaries vanish there.
 */
export function bubbleTints(
  colors: { primary: string; secondary: string } | null | undefined,
): {
  light: string
  dark: string
} | null {
  if (!colors) return null
  const p = luminance(colors.primary) ?? 0
  const s = luminance(colors.secondary) ?? 0
  return {
    light: colors.primary,
    dark: s > p ? colors.secondary : colors.primary,
  }
}
