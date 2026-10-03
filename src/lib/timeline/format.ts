/**
 * Play descriptions as structured text: who did what to whom, for what
 * result, and where. Splits a Source's description into typed segments the
 * chat bubbles style differently, so a message reads at a glance instead of
 * as a block of text. Pure.
 *
 * Players are found from the Play's Involved Players (full names and the
 * "F.Last" form ESPN uses), never guessed; results, flags and places come
 * from per-League patterns. Parenthesised asides (tacklers, season counts,
 * penalty minutes) are muted. Formation and crew noise is dropped.
 */

import type { TimelinePlayer } from '@/lib/model/timeline'
import type { League, Side } from '@/lib/model/types'

export type SegmentKind =
  'plain' | 'player' | 'result' | 'flag' | 'place' | 'aside'

export interface Segment {
  text: string
  kind: SegmentKind
  /** Inside a parenthesised aside (e.g. the tackler): de-emphasized. */
  muted: boolean
  /** For a player: which team they're on, when known. */
  side?: Side | null
}

const RESULTS: Record<League, Array<RegExp>> = {
  nfl: [
    /\bfor (?:-?\d+ yards?|no gain)\b/g,
    /\bTOUCHDOWN\b/g,
    /\bis (?:GOOD|No Good|NO GOOD)\b/g,
    /\bINTERCEPTED\b/g,
    /\bFUMBLES\b/g,
    /\bsacked\b/g,
    /\bincomplete\b/g,
    /\bATTEMPT (?:SUCCEEDS|FAILS)\b/g,
    /\bSAFETY\b/g,
  ],
  cfb: [
    /\bfor (?:\d+ yards? (?:gain|loss)|loss of \d+ yards?|no gain)\b/g,
    /\bfor -?\d+ yards?\b/g,
    /\breturn (?:for loss of )?\d+ yards?\b/g,
    /\bTOUCHDOWN\b/g,
    /\bGOOD\b/g,
    /\b(?:MISSED|BLOCKED)\b/g,
    /\bkick attempt (?:good|failed|missed|blocked)\b/g,
    /\b(?:intercepted|INTERCEPTED)\b/g,
    /\bfumbled\b/g,
    /\bsacked\b/g,
    /\bincomplete\b/g,
    /\bTouchback\b/g,
    /\bSAFETY\b/g,
  ],
  mlb: [
    /\b(?:homers|singles|doubles|triples|scores|walks|intentionally walks)\b/g,
    /\bstrikes out(?: swinging| looking| on a foul tip)?\b/g,
    /\b(?:grounds|flies|lines|pops) out\b/g,
    /\bgrounds into an? (?:double|triple|force) (?:play|out)\b/g,
    /\bcalled out on strikes\b/g,
    /\bout on a sacrifice (?:fly|bunt)\b/g,
    /\bhit by (?:a )?pitch\b/g,
    /\bsteals\b/g,
    /\bcaught stealing\b/g,
    /\breaches on (?:a|an) [a-z]+ error\b/g,
  ],
  nhl: [
    /\bgoal\b/g,
    /\bwins the faceoff\b/g,
    /\bmisses\b/g,
    /\bhits\b/g,
    /\b(?:giveaway|takeaway)\b/g,
    /\bshot blocked\b/g,
    /\bsaved by\b/g,
    /\bis stopped\b/g,
  ],
  nba: [
    /\b(?:makes|misses|blocks)\b/g,
    /\b(?:defensive|offensive)(?: team)? rebound\b/g,
    /\b(?:bad pass|lost ball|traveling|shot clock|out of bounds)?\s?turnover\b/g,
    /\benters the game for\b/g,
  ],
}

const FLAGS: Array<RegExp> = [
  /\bPENALTY on [A-Z]{2,3}\b/g,
  // College: "PENALTY TEXAS Illegal Formation".
  /\bPENALTY [A-Z][A-Z&]+\b/g,
  /\bNO PLAY\b/g,
  /^Penalty\b/g,
  /\bPenalty\b/g,
  // Basketball fouls and violations.
  /\b(?:flagrant foul type [12]|technical foul)\b/g,
  /\b(?:shooting|personal|offensive|loose ball|personal take|transition take|take|away from play|clear path) foul\b/g,
  /\b(?:defensive )?goaltending\b/g,
]

const PLACES: Record<League, Array<RegExp>> = {
  nfl: [
    /\b(?:ob at|pushed ob at|ran ob at|to|at)\s+(?:[A-Z]{2,3} \d{1,2}|50)\b/g,
  ],
  cfb: [
    /\b(?:to|at) the (?:[A-Z][A-Z&]+ \d{1,2}|end zone|50)\b/g,
    /\b(?:caught |thrown )?(?:at|to) [A-Z][A-Z&]+ \d{1,2}\b/g,
  ],
  mlb: [
    /\bon an? (?:fly ball|line drive|sharp line drive|soft line drive|ground ball|sharp ground ball|soft ground ball|pop up|bunt)\b[^.]*?(?=\.|$)/g,
    /\bto (?:1st|2nd|3rd)\b/g,
  ],
  nhl: [],
  nba: [],
}

/** Formation tags and crew credits that add nothing to a chat message. */
function clean(description: string, league: League): string {
  if (league !== 'nfl') return description.trim()
  return description
    .replace(
      /^(?:\s*\((?:[^)]*(?:Shotgun|Huddle|formation|Pistol)[^)]*)\))+\s*/i,
      '',
    )
    .replace(/(?:^|\s)[A-Z]\.[A-Za-z'.-]+ reported in as eligible\.\s*/g, ' ')
    .replace(/,\s*(?:Center|Holder)-[A-Z]\.[A-Za-z'-]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Ways a Source may write this player's name, longest first. */
export function nameForms(name: string): Array<string> {
  const parts = name.trim().split(/\s+/)
  const forms = new Set<string>([name])
  if (parts.length >= 2) {
    const rest = parts.slice(1).join(' ')
    forms.add(`${parts[0][0]}.${rest}`)
    forms.add(`${parts[0][0]}. ${rest}`)
  }
  return [...forms].sort((a, b) => b.length - a.length)
}

export function segmentDescription(
  description: string,
  league: League,
  players: ReadonlyArray<Pick<TimelinePlayer, 'name'> & { side?: Side | null }>,
): Array<Segment> {
  const text = clean(description, league)
  const kind: Array<SegmentKind | null> = new Array(text.length).fill(null)
  const muted: Array<boolean> = new Array(text.length).fill(false)
  const side: Array<Side | null> = new Array(text.length).fill(null)

  for (const m of text.matchAll(/\([^()]*\)/g)) {
    for (let i = m.index; i < m.index + m[0].length; i++) muted[i] = true
  }

  const claim = (pattern: RegExp, as: SegmentKind) => {
    for (const m of text.matchAll(pattern)) {
      for (let i = m.index; i < m.index + m[0].length; i++) kind[i] ??= as
    }
  }

  // Each player's name forms, longest first across everyone, so "Ha-Seong
  // Kim" wins over a shorter overlapping name and its team is known.
  const forms = players
    .flatMap((p) =>
      nameForms(p.name).map((form) => ({ form, side: p.side ?? null })),
    )
    .sort((a, b) => b.form.length - a.form.length)
  for (const { form, side: team } of forms) {
    const pattern = new RegExp(
      `(?<![\\p{L}.])${escape(form)}(?![\\p{L}])`,
      'gu',
    )
    for (const m of text.matchAll(pattern)) {
      if (kind[m.index] !== null) continue
      for (let i = m.index; i < m.index + m[0].length; i++) {
        kind[i] = 'player'
        side[i] = team
      }
    }
  }
  for (const p of FLAGS) claim(p, 'flag')
  for (const p of RESULTS[league]) claim(p, 'result')
  for (const p of PLACES[league]) claim(p, 'place')

  const segments: Array<Segment> = []
  for (let i = 0; i < text.length; i++) {
    const k: SegmentKind = kind[i] ?? (muted[i] ? 'aside' : 'plain')
    const last = segments.at(-1)
    if (
      last &&
      last.kind === k &&
      last.muted === muted[i] &&
      (last.side ?? null) === side[i]
    ) {
      last.text += text[i]
    } else {
      segments.push({
        text: text[i],
        kind: k,
        muted: muted[i],
        ...(k === 'player' ? { side: side[i] } : {}),
      })
    }
  }
  return segments
}
