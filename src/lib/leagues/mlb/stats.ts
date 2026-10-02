/**
 * MLB in-game stat lines as of a given Play (CONTEXT.md, "Play Detail"),
 * computed from the Game's stored Plays rather than the Source's box score,
 * which only ever reflects the Game *now*. Pure.
 */

import type { Json, Score } from '@/lib/model/types'

/** The slice of a stored Play this needs. */
export interface StatPlay {
  sequence: number
  playType: string | null
  segmentLabel: string
  score: Score
  players: Array<{ id: string; role: string }>
  /** True for a completed plate appearance (vs an in-PA action). */
  plateAppearance: boolean
  detail: Json
}

export interface BattingLine {
  kind: 'batting'
  pa: number
  ab: number
  h: number
  hr: number
  rbi: number
  bb: number
  k: number
}

export interface PitchingLine {
  kind: 'pitching'
  outs: number
  h: number
  r: number
  er: number
  bb: number
  k: number
  pitches: number
}

const HITS = new Set(['single', 'double', 'triple', 'home_run'])
const WALKS = new Set(['walk', 'intent_walk'])
const NOT_AT_BATS = new Set([
  'walk',
  'intent_walk',
  'hit_by_pitch',
  'sac_fly',
  'sac_bunt',
  'sac_fly_double_play',
  'sac_bunt_double_play',
  'catcher_interf',
])
const STRIKEOUTS = new Set([
  'strikeout',
  'strikeout_double_play',
  'strikeout_triple_play',
])

function detailNumber(detail: Json, key: string): number {
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const v = detail[key]
    return typeof v === 'number' ? v : 0
  }
  return 0
}

function credits(detail: Json): Array<{ id: string; credit: string }> {
  if (
    detail &&
    typeof detail === 'object' &&
    !Array.isArray(detail) &&
    Array.isArray(detail.credits)
  ) {
    return detail.credits.flatMap((c) =>
      c &&
      typeof c === 'object' &&
      !Array.isArray(c) &&
      typeof c.id === 'string' &&
      typeof c.credit === 'string'
        ? [{ id: c.id, credit: c.credit }]
        : [],
    )
  }
  return []
}

function pitchCount(detail: Json): number {
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const p = detail.pitches
    return Array.isArray(p) ? p.length : 0
  }
  return 0
}

/**
 * Stat lines for `playerId` through `throughSequence` (inclusive): a batting
 * line if they have batted, a pitching line if they have pitched.
 */
export function mlbLinesAsOf(
  plays: ReadonlyArray<StatPlay>,
  playerId: string,
  throughSequence: number,
): Array<BattingLine | PitchingLine> {
  const sorted = [...plays].sort((a, b) => a.sequence - b.sequence)
  const bat: BattingLine = {
    kind: 'batting',
    pa: 0,
    ab: 0,
    h: 0,
    hr: 0,
    rbi: 0,
    bb: 0,
    k: 0,
  }
  const pitch: PitchingLine = {
    kind: 'pitching',
    outs: 0,
    h: 0,
    r: 0,
    er: 0,
    bb: 0,
    k: 0,
    pitches: 0,
  }
  let pitched = false
  let half = ''
  let outsBefore = 0
  // The pitcher on the mound for the current half: actions (wild pitches,
  // steals) don't name him, but runs scoring on them are his.
  let currentPitcher: string | null = null

  for (const play of sorted) {
    if (play.sequence > throughSequence) break
    if (play.segmentLabel !== half) {
      half = play.segmentLabel
      outsBefore = 0
    }
    const type = play.playType ?? ''

    if (play.plateAppearance) {
      const batter = play.players.find((p) => p.role === 'batter')?.id
      const pitcher = play.players.find((p) => p.role === 'pitcher')?.id ?? null
      currentPitcher = pitcher
      const outsAfter = detailNumber(play.detail, 'outs')
      const outs = Math.max(0, outsAfter - outsBefore)
      outsBefore = outsAfter

      if (batter === playerId) {
        bat.pa++
        if (!NOT_AT_BATS.has(type)) bat.ab++
        if (HITS.has(type)) bat.h++
        if (type === 'home_run') bat.hr++
        if (WALKS.has(type)) bat.bb++
        if (STRIKEOUTS.has(type)) bat.k++
        bat.rbi += detailNumber(play.detail, 'rbi')
      }
      if (pitcher === playerId) {
        pitched = true
        pitch.outs += outs
        pitch.pitches += pitchCount(play.detail)
        if (HITS.has(type)) pitch.h++
        if (WALKS.has(type)) pitch.bb++
        if (STRIKEOUTS.has(type)) pitch.k++
      }
    } else if (type === 'pitching_substitution') {
      currentPitcher =
        play.players.find((p) => p.role === 'pitcher')?.id ?? currentPitcher
      if (currentPitcher === playerId) pitched = true
    }
    // Runs are charged to the responsible pitcher, who may have left already.
    for (const credit of credits(play.detail)) {
      if (credit.id !== playerId) continue
      if (credit.credit === 'run_charged') pitch.r++
      if (credit.credit === 'earned_run') pitch.er++
    }
  }

  const lines: Array<BattingLine | PitchingLine> = []
  if (bat.pa > 0) lines.push(bat)
  if (pitched) lines.push(pitch)
  return lines
}

/** "4.2" style innings pitched from outs recorded. */
export function inningsPitched(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

/** One-line summary, e.g. "2-4, HR, 3 RBI" or "4.2 IP, 3 H, 1 R, 6 K, 78 P". */
export function formatLine(line: BattingLine | PitchingLine): string {
  if (line.kind === 'batting') {
    const parts = [`${line.h}-${line.ab}`]
    if (line.hr) parts.push(line.hr > 1 ? `${line.hr} HR` : 'HR')
    if (line.rbi) parts.push(`${line.rbi} RBI`)
    if (line.bb) parts.push(line.bb > 1 ? `${line.bb} BB` : 'BB')
    if (line.k) parts.push(line.k > 1 ? `${line.k} K` : 'K')
    return parts.join(', ')
  }
  return [
    `${inningsPitched(line.outs)} IP`,
    `${line.h} H`,
    `${line.r} R`,
    `${line.bb} BB`,
    `${line.k} K`,
    `${line.pitches} P`,
  ].join(', ')
}
