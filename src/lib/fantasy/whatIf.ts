/**
 * What-if standings (CONTEXT.md, "What-if standings"): a football points
 * league's record had every team started its best lineup each week,
 * against what its opponent actually scored. Each finished week's
 * matchups: each side's best lineup from the Players it could have
 * started (slot by slot, as the league's slots and each Player's
 * eligibility allow), the points it left on the bench, and whether the
 * loser's best lineup (or one swap) would have won. Ported from Dream
 * Team. Pure.
 */

/** A Player a side could have started that week. */
export interface WhatIfPlayer {
  id: string
  name: string
  /** Their Fantasy points that week (0 with no line). */
  points: number
  /** The slot they were in. */
  slot: string
  starter: boolean
  /** The starting slots they could fill. */
  eligible: ReadonlyArray<string>
}

export interface WhatIfSideInput {
  teamId: number
  name: string
  abbrev: string
  /** The provider's team total (with any adjustments). */
  total: number
  /** Starters and bench; never injured reserve. */
  roster: ReadonlyArray<WhatIfPlayer>
}

export interface WhatIfMatchupInput {
  period: number
  home: WhatIfSideInput
  away: WhatIfSideInput
}

export interface WhatIfSwap {
  in: string
  out: string
  gain: number
}

export interface WhatIfSide {
  teamId: number
  name: string
  abbrev: string
  total: number
  /** The best lineup's points over the lineup started (0 when it was). */
  benchLeft: number
  /** The bench Player who'd have added most in one starter's place. */
  bestSwap: WhatIfSwap | null
}

export interface WhatIfMatchup {
  period: number
  home: WhatIfSide
  away: WhatIfSide
  winner: 'home' | 'away' | 'tie'
  /** The loser's best lineup would have won. */
  flipped: boolean
  /** …and one swap alone would have done it. */
  oneMove: boolean
}

export interface WhatIfRow {
  teamId: number
  name: string
  abbrev: string
  wins: number
  losses: number
  ties: number
  whatIfWins: number
  whatIfLosses: number
  whatIfTies: number
  /** Points left on the bench, all season. */
  benchLeft: number
  /** Losses a best lineup would have won. */
  flips: number
  /** …that one swap would have won. */
  oneMoveFlips: number
  weeks: number
}

const round = (n: number) => Math.round(n * 100) / 100

const FORBIDDEN = 1e9

/**
 * The most points slots (rows) can take from Players (columns): the
 * Hungarian algorithm with potentials, O(n²·m). `-Infinity` marks a
 * Player who can't fill a slot; a slot is left empty (-1) when no one
 * eligible is worth more than nothing.
 */
export function maxWeightAssignment(
  weights: ReadonlyArray<ReadonlyArray<number>>,
): { assignment: Array<number>; total: number } {
  const n = weights.length
  const m = n === 0 ? 0 : weights[0].length
  if (n === 0 || m === 0) return { assignment: Array(n).fill(-1), total: 0 }
  // Real columns, then one free "empty" column per row.
  const cols = m + n
  const cost = (i: number, j: number): number => {
    if (j >= m) return 0
    const w = weights[i][j]
    return Number.isFinite(w) ? -w : FORBIDDEN
  }
  const u = new Array<number>(n + 1).fill(0)
  const v = new Array<number>(cols + 1).fill(0)
  const p = new Array<number>(cols + 1).fill(0)
  const way = new Array<number>(cols + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array<number>(cols + 1).fill(Infinity)
    const used = new Array<boolean>(cols + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= cols; j++) {
        if (used[j]) continue
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= cols; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0 !== 0)
  }
  const assignment = new Array<number>(n).fill(-1)
  let total = 0
  for (let j = 1; j <= cols; j++) {
    const row = p[j]
    if (row === 0 || j - 1 >= m || cost(row - 1, j - 1) >= FORBIDDEN) continue
    assignment[row - 1] = j - 1
    total += weights[row - 1][j - 1]
  }
  return { assignment, total }
}

/** The best lineup's points for the league's starting slots. */
export function optimalTotal(
  roster: ReadonlyArray<WhatIfPlayer>,
  slots: ReadonlyArray<string>,
): number {
  const weights = slots.map((slot) =>
    roster.map((p) =>
      p.eligible.includes(slot) || p.slot === slot ? p.points : -Infinity,
    ),
  )
  return round(maxWeightAssignment(weights).total)
}

export function analyzeSide(
  side: WhatIfSideInput,
  slots: ReadonlyArray<string>,
): WhatIfSide {
  const starters = side.roster.filter((p) => p.starter)
  const bench = side.roster.filter((p) => !p.starter)
  const started = round(starters.reduce((n, p) => n + p.points, 0))
  const best = optimalTotal(side.roster, slots)
  let bestSwap: WhatIfSwap | null = null
  for (const b of bench)
    for (const s of starters) {
      if (!b.eligible.includes(s.slot)) continue
      const gain = round(b.points - s.points)
      if (gain > 0 && (!bestSwap || gain > bestSwap.gain))
        bestSwap = { in: b.name, out: s.name, gain }
    }
  return {
    teamId: side.teamId,
    name: side.name,
    abbrev: side.abbrev,
    total: round(side.total),
    benchLeft: round(Math.max(0, best - started)),
    bestSwap,
  }
}

/** One finished matchup: who won, and what the loser left on the bench. */
export function analyzeMatchup(
  m: WhatIfMatchupInput,
  slots: ReadonlyArray<string>,
): WhatIfMatchup {
  const home = analyzeSide(m.home, slots)
  const away = analyzeSide(m.away, slots)
  const winner =
    home.total === away.total
      ? 'tie'
      : home.total > away.total
        ? 'home'
        : 'away'
  if (winner === 'tie')
    return {
      period: m.period,
      home,
      away,
      winner,
      flipped: false,
      oneMove: false,
    }
  const [loser, victor] = winner === 'home' ? [away, home] : [home, away]
  // The provider's total (bonuses, adjustments) plus only the lineup gain.
  const flipped = round(loser.total + loser.benchLeft) > victor.total
  return {
    period: m.period,
    home,
    away,
    winner,
    flipped,
    oneMove:
      flipped &&
      loser.bestSwap !== null &&
      round(loser.total + loser.bestSwap.gain) > victor.total,
  }
}

/**
 * The season's What-if standings: each team's record as it stands and
 * had it started its best lineup every week (its opponent as they
 * played), best what-if record first.
 */
export function summarizeWhatIf(
  matchups: ReadonlyArray<WhatIfMatchup>,
): Array<WhatIfRow> {
  const rows = new Map<number, WhatIfRow>()
  for (const m of matchups)
    for (const key of ['home', 'away'] as const) {
      const side = m[key]
      const other = key === 'home' ? m.away : m.home
      let row = rows.get(side.teamId)
      if (!row) {
        row = {
          teamId: side.teamId,
          name: side.name,
          abbrev: side.abbrev,
          wins: 0,
          losses: 0,
          ties: 0,
          whatIfWins: 0,
          whatIfLosses: 0,
          whatIfTies: 0,
          benchLeft: 0,
          flips: 0,
          oneMoveFlips: 0,
          weeks: 0,
        }
        rows.set(side.teamId, row)
      }
      row.weeks++
      row.benchLeft = round(row.benchLeft + side.benchLeft)
      if (m.winner === 'tie') row.ties++
      else if (m.winner === key) row.wins++
      else {
        row.losses++
        if (m.flipped) row.flips++
        if (m.oneMove) row.oneMoveFlips++
      }
      const best = round(side.total + side.benchLeft)
      if (best > other.total) row.whatIfWins++
      else if (best < other.total) row.whatIfLosses++
      else row.whatIfTies++
    }
  return [...rows.values()].sort(
    (a, b) =>
      b.whatIfWins - a.whatIfWins ||
      a.whatIfLosses - b.whatIfLosses ||
      b.benchLeft - a.benchLeft ||
      a.name.localeCompare(b.name),
  )
}
