/**
 * The Viewer's Prediction record over a range (CONTEXT.md, "Record"):
 * volume, results, and where they win and lose, by sport, kind, market and
 * Combo size, with the patterns worth noticing. Pure, so the screen can
 * switch ranges without asking the server again.
 */

export interface RecordLeg {
  /** Kalshi's series: the event ticker's first part ("KXNFLTD"). */
  series: string
  playerProp: boolean
  status: 'won' | 'lost' | 'pending'
}

export interface RecordEntry {
  id: string
  kind: 'single' | 'combo'
  title: string
  cost: number
  status: 'open' | 'settled' | 'closed'
  result: 'won' | 'lost' | 'void' | null
  pnl: number | null
  /** When it was made (Kalshi's first fill), else first seen. */
  madeAt: string
  settledAt: string | null
  /**
   * The chance they bought in at: what they paid per contract (the
   * implied chance of their side). Null when it can't be known.
   */
  entryChance?: number | null
  legs: Array<RecordLeg>
}

export type Sport = 'NFL' | 'College football' | 'MLB' | 'NBA' | 'NHL' | 'Other'
export type Market =
  'Winner' | 'Spread' | 'Total' | 'Player prop' | 'First inning' | 'Other'

const SPORT_PREFIXES: Array<[RegExp, Sport]> = [
  [/^KXNCAAF/, 'College football'],
  [/^KXNFL/, 'NFL'],
  [/^KXMLB/, 'MLB'],
  [/^KXNBA/, 'NBA'],
  [/^KXNHL/, 'NHL'],
]

export function sportOf(series: string): Sport {
  return SPORT_PREFIXES.find(([re]) => re.test(series))?.[1] ?? 'Other'
}

export function marketOf(leg: RecordLeg): Market {
  const s = leg.series.replace(/^KX(NCAAF|NFL|MLB|NBA|NHL|NPB)/, '')
  if (/RFI$/.test(s)) return 'First inning'
  if (/SPREAD/.test(s)) return 'Spread'
  if (/TOTAL/.test(s)) return 'Total'
  if (/^(GAME|MATCH)$/.test(s) || /MATCH$/.test(leg.series)) return 'Winner'
  if (leg.playerProp || /(TD|TDS|YDS|REC|KS|GOAL|HR|HITS|PTS)$/.test(s))
    return 'Player prop'
  return 'Other'
}

export interface Range {
  from: Date | null
  to: Date | null
}

function inRange(e: RecordEntry, range: Range): boolean {
  const t = Date.parse(e.madeAt)
  return (
    (!range.from || t >= range.from.getTime()) &&
    (!range.to || t < range.to.getTime())
  )
}

/** Bets bought in at a similar chance, and how often they actually won. */
export interface CalibrationBucket {
  /** The bucket's span of entry chances (0–1). */
  from: number
  to: number
  /** The average chance they bought in at. */
  implied: number
  /** How often they won (0–1). */
  actual: number
  won: number
  count: number
}

export interface Calibration {
  buckets: Array<CalibrationBucket>
  /**
   * Wins above (or below) what the odds implied, as a share of bets: the
   * average of won (1 or 0) minus the entry chance. +0.06 means they won
   * six points more often than the market priced them to.
   */
  edge: number | null
  count: number
}

/** A bucket with fewer bets than this joins its neighbor. */
const MIN_BUCKET = 3
const BUCKET_WIDTH = 0.1

/**
 * "Are you beating the odds?": settled, won-or-lost Predictions in the
 * range, bucketed by the chance they were bought at (tenths, with thin
 * buckets merged into their neighbors), each with its actual win rate.
 */
export function calibrationOf(
  all: ReadonlyArray<RecordEntry>,
  range: Range,
): Calibration {
  const decided = all.filter(
    (e): e is RecordEntry & { entryChance: number } =>
      inRange(e, range) &&
      (e.result === 'won' || e.result === 'lost') &&
      typeof e.entryChance === 'number' &&
      e.entryChance > 0 &&
      e.entryChance < 1,
  )
  if (decided.length === 0) return { buckets: [], edge: null, count: 0 }
  // Tenths first…
  const tenths = Array.from({ length: 10 }, (_, i) => ({
    from: i * BUCKET_WIDTH,
    to: (i + 1) * BUCKET_WIDTH,
    entries: [] as Array<RecordEntry & { entryChance: number }>,
  }))
  for (const e of decided)
    tenths[Math.min(9, Math.floor(e.entryChance / BUCKET_WIDTH))].entries.push(
      e,
    )
  // …then thin ones merged forward, and a thin last one into the one before.
  const merged: typeof tenths = []
  let open: (typeof tenths)[number] | null = null
  for (const t of tenths) {
    if (t.entries.length === 0 && !open) continue
    open = open
      ? { from: open.from, to: t.to, entries: [...open.entries, ...t.entries] }
      : t
    if (open.entries.length >= MIN_BUCKET) {
      merged.push(open)
      open = null
    }
  }
  if (open && open.entries.length > 0) {
    const last = merged.pop()
    merged.push(
      last
        ? {
            from: last.from,
            to: open.to,
            entries: [...last.entries, ...open.entries],
          }
        : open,
    )
  }
  const buckets = merged.map((b): CalibrationBucket => {
    const won = b.entries.filter((e) => e.result === 'won').length
    return {
      from: b.from,
      to: b.to,
      implied:
        b.entries.reduce((n, e) => n + e.entryChance, 0) / b.entries.length,
      actual: won / b.entries.length,
      won,
      count: b.entries.length,
    }
  })
  const edge =
    decided.reduce(
      (n, e) => n + (e.result === 'won' ? 1 : 0) - e.entryChance,
      0,
    ) / decided.length
  return { buckets, edge, count: decided.length }
}

export interface Line {
  label: string
  count: number
  staked: number
  /** Realized: settled Predictions only. */
  pnl: number
  won: number
  lost: number
}

const emptyLine = (label: string): Line => ({
  label,
  count: 0,
  staked: 0,
  pnl: 0,
  won: 0,
  lost: 0,
})

function add(line: Line, e: RecordEntry) {
  line.count++
  line.staked += e.cost
  if (e.status !== 'open') line.pnl += e.pnl ?? 0
  if (e.result === 'won') line.won++
  if (e.result === 'lost') line.lost++
}

export const winRate = (l: Pick<Line, 'won' | 'lost'>) =>
  l.won + l.lost > 0 ? l.won / (l.won + l.lost) : null

function group(
  entries: ReadonlyArray<RecordEntry>,
  key: (e: RecordEntry) => string,
): Array<Line> {
  const lines = new Map<string, Line>()
  for (const e of entries) {
    const k = key(e)
    const line = lines.get(k) ?? emptyLine(k)
    add(line, e)
    lines.set(k, line)
  }
  return [...lines.values()].sort((a, b) => b.staked - a.staked)
}

/** A single's market, or "Combo". */
const marketKey = (e: RecordEntry) =>
  e.kind === 'combo' ? 'Combo' : e.legs[0] ? marketOf(e.legs[0]) : 'Other'

/** A Prediction's sport: its Legs' if they share one, else "Mixed". */
function sportKey(e: RecordEntry): string {
  const sports = new Set(e.legs.map((l) => sportOf(l.series)))
  return sports.size === 1 ? [...sports][0] : sports.size ? 'Mixed' : 'Other'
}

function comboSizeKey(e: RecordEntry): string {
  const n = e.legs.length
  return n >= 6 ? '6+ legs' : `${n} legs`
}

interface Streak {
  kind: 'won' | 'lost'
  length: number
}

interface DayPoint {
  /** Local day, YYYY-MM-DD. */
  day: string
  staked: number
  /** Realized P&L settled that day. */
  pnl: number
}

interface Insight {
  tone: 'good' | 'bad' | 'neutral'
  text: string
}

export interface PredictionRecord {
  totals: Line & {
    open: number
    openStaked: number
    settled: number
    avgStake: number
    roi: number | null
    best: RecordEntry | null
    worst: RecordEntry | null
  }
  streak: Streak | null
  longestWin: number
  bySport: Array<Line>
  byMarket: Array<Line>
  byComboSize: Array<Line>
  legs: { won: number; lost: number; byMarket: Array<Line> }
  /** Combos lost by a single Leg. */
  nearMisses: number
  days: Array<DayPoint>
  insights: Array<Insight>
}

const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const money = (n: number) =>
  `${n < 0 ? '−' : '+'}$${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 0 : 2)}`
const pct = (n: number) => `${Math.round(n * 100)}%`

export function buildRecord(
  all: ReadonlyArray<RecordEntry>,
  range: Range,
): PredictionRecord {
  const entries = all.filter((e) => inRange(e, range))
  const totals = emptyLine('All')
  for (const e of entries) add(totals, e)
  const settled = entries.filter((e) => e.status !== 'open')
  const open = entries.filter((e) => e.status === 'open')
  const settledStaked = settled.reduce((n, e) => n + e.cost, 0)
  const withPnl = settled.filter((e) => e.pnl !== null)
  const best = withPnl.reduce<RecordEntry | null>(
    (b, e) => (e.pnl! > 0 && (!b || e.pnl! > b.pnl!) ? e : b),
    null,
  )
  const worst = withPnl.reduce<RecordEntry | null>(
    (w, e) => (e.pnl! < 0 && (!w || e.pnl! < w.pnl!) ? e : w),
    null,
  )

  // Streaks, in the order results came in.
  const decided = settled
    .filter((e) => e.result === 'won' || e.result === 'lost')
    .sort((a, b) =>
      (a.settledAt ?? a.madeAt).localeCompare(b.settledAt ?? b.madeAt),
    )
  let streak: Streak | null = null
  let longestWin = 0
  let run = 0
  for (const e of decided) {
    const kind = e.result as 'won' | 'lost'
    const length: number =
      streak !== null && streak.kind === kind ? streak.length + 1 : 1
    streak = { kind, length }
    run = kind === 'won' ? run + 1 : 0
    longestWin = Math.max(longestWin, run)
  }

  const combos = entries.filter((e) => e.kind === 'combo')
  const legs = entries.flatMap((e) => e.legs)
  const legLines = new Map<string, Line>()
  for (const l of legs) {
    const k = marketOf(l)
    const line = legLines.get(k) ?? emptyLine(k)
    line.count++
    if (l.status === 'won') line.won++
    if (l.status === 'lost') line.lost++
    legLines.set(k, line)
  }
  const nearMisses = combos.filter(
    (e) =>
      e.result === 'lost' &&
      e.legs.filter((l) => l.status === 'lost').length === 1,
  ).length

  // Volume by the day it was made; P&L by the day it settled.
  const dayMap = new Map<string, DayPoint>()
  const day = (d: string) => dayMap.get(d) ?? { day: d, staked: 0, pnl: 0 }
  for (const e of entries) {
    const d = day(localDay(e.madeAt))
    d.staked += e.cost
    dayMap.set(d.day, d)
    if (e.status !== 'open' && e.pnl !== null) {
      const s = day(localDay(e.settledAt ?? e.madeAt))
      s.pnl += e.pnl
      dayMap.set(s.day, s)
    }
  }
  const days = [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day))

  const bySport = group(entries, sportKey)
  const byMarket = group(entries, marketKey)
  const byComboSize = group(combos, comboSizeKey).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  )
  const record: PredictionRecord = {
    totals: {
      ...totals,
      open: open.length,
      openStaked: open.reduce((n, e) => n + e.cost, 0),
      settled: settled.length,
      avgStake: entries.length ? totals.staked / entries.length : 0,
      roi: settledStaked > 0 ? totals.pnl / settledStaked : null,
      best,
      worst,
    },
    streak,
    longestWin,
    bySport,
    byMarket,
    byComboSize,
    legs: {
      won: legs.filter((l) => l.status === 'won').length,
      lost: legs.filter((l) => l.status === 'lost').length,
      byMarket: [...legLines.values()].sort((a, b) => b.count - a.count),
    },
    nearMisses,
    days,
    insights: [],
  }
  record.insights = insightsOf(record)
  return record
}

/** The few things worth saying about a record, strongest first. */
function insightsOf(r: PredictionRecord): Array<Insight> {
  const out: Array<Insight> = []
  const decided = (l: Line) => l.won + l.lost >= 3
  const singles = r.byMarket.filter((l) => l.label !== 'Combo')
  const single = singles.reduce(
    (s, l) => ({
      ...s,
      won: s.won + l.won,
      lost: s.lost + l.lost,
      pnl: s.pnl + l.pnl,
    }),
    emptyLine('Singles'),
  )
  const combo = r.byMarket.find((l) => l.label === 'Combo')
  if (combo && decided(combo) && decided(single)) {
    const better = combo.pnl > single.pnl ? 'Combos' : 'Singles'
    const verdict =
      Math.max(combo.pnl, single.pnl) > 0
        ? `${better} are doing more for you.`
        : `${better} are costing you less.`
    out.push({
      tone: 'neutral',
      text: `Singles hit ${pct(winRate(single)!)} (${money(single.pnl)}); combos ${pct(winRate(combo)!)} (${money(combo.pnl)}). ${verdict}`,
    })
  }
  // Named sports only: "Other" and "Mixed" aren't a sport to lean into.
  const sports = r.bySport.filter(
    (l) => decided(l) && l.label !== 'Other' && l.label !== 'Mixed',
  )
  if (sports.length > 1) {
    const best = [...sports].sort((a, b) => b.pnl - a.pnl)[0]
    const worst = [...sports].sort((a, b) => a.pnl - b.pnl)[0]
    if (best.pnl > 0)
      out.push({
        tone: 'good',
        text: `${best.label} is your best: ${money(best.pnl)} on ${best.count} predictions.`,
      })
    if (worst.pnl < 0 && worst !== best)
      out.push({
        tone: 'bad',
        text: `${worst.label} is costing you: ${money(worst.pnl)} on ${worst.count}.`,
      })
  }
  if (r.nearMisses >= 2) {
    const lost = r.byMarket.find((l) => l.label === 'Combo')?.lost ?? 0
    out.push({
      tone: 'neutral',
      text: `${r.nearMisses} of ${lost} lost combos missed by a single leg.`,
    })
  }
  const legMarkets = r.legs.byMarket.filter(decided)
  if (legMarkets.length > 1) {
    const weakest = [...legMarkets].sort((a, b) => winRate(a)! - winRate(b)!)[0]
    out.push({
      tone: 'bad',
      text: `${weakest.label} legs hit least often: ${pct(winRate(weakest)!)} of ${weakest.won + weakest.lost}.`,
    })
  }
  const sizes = r.byComboSize.filter((l) => l.count >= 3)
  if (sizes.length > 1) {
    const sweet = [...sizes].sort((a, b) => b.pnl - a.pnl)[0]
    out.push({
      tone: sweet.pnl >= 0 ? 'good' : 'neutral',
      text: `Your best combo size is ${sweet.label}: ${sweet.won} of ${sweet.won + sweet.lost} won, ${money(sweet.pnl)}.`,
    })
  }
  return out.slice(0, 5)
}
