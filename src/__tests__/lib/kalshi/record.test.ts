import { describe, expect, it } from 'vitest'
import type { RecordEntry, RecordLeg } from '@/lib/kalshi/record'
import {
  buildRecord,
  calibrationOf,
  marketOf,
  sportOf,
} from '@/lib/kalshi/record'

const leg = (
  series: string,
  status: RecordLeg['status'] = 'won',
  playerProp = false,
): RecordLeg => ({
  series,
  status,
  playerProp,
})
let n = 0
const entry = (over: Partial<RecordEntry>): RecordEntry => ({
  id: `p${n++}`,
  kind: 'single',
  title: 't',
  cost: 10,
  status: 'settled',
  result: 'won',
  pnl: 5,
  madeAt: '2026-10-01T18:00:00Z',
  settledAt: '2026-10-01T22:00:00Z',
  legs: [leg('KXNFLGAME')],
  ...over,
})

describe('classifying markets', () => {
  it('reads sport and market from Kalshi’s series', () => {
    expect(sportOf('KXNCAAFSPREAD')).toBe('College football')
    expect(sportOf('KXNFLTD')).toBe('NFL')
    expect(sportOf('KXATPMATCH')).toBe('Other')
    expect(marketOf(leg('KXNFLGAME'))).toBe('Winner')
    expect(marketOf(leg('KXNCAAFSPREAD'))).toBe('Spread')
    expect(marketOf(leg('KXMLBF5TOTAL'))).toBe('Total')
    expect(marketOf(leg('KXMLBRFI'))).toBe('First inning')
    expect(marketOf(leg('KXNFLRECYDS'))).toBe('Player prop')
    expect(marketOf(leg('KXWTAMATCH'))).toBe('Winner')
  })
})

describe('a Record', () => {
  const entries = [
    entry({ legs: [leg('KXNFLGAME')], pnl: 8 }),
    entry({ result: 'lost', pnl: -10, legs: [leg('KXNFLSPREAD', 'lost')] }),
    entry({
      kind: 'combo',
      result: 'lost',
      pnl: -10,
      legs: [leg('KXMLBGAME'), leg('KXMLBRFI', 'lost'), leg('KXMLBGAME')],
    }),
    entry({
      status: 'open',
      result: null,
      pnl: null,
      cost: 20,
      settledAt: null,
    }),
    entry({
      madeAt: '2026-08-01T18:00:00Z',
      settledAt: '2026-08-01T22:00:00Z',
      pnl: 100,
    }),
  ]

  it('totals volume and realized results over the range only', () => {
    const r = buildRecord(entries, {
      from: new Date('2026-09-25T00:00:00Z'),
      to: null,
    })
    expect(r.totals).toMatchObject({
      count: 4,
      staked: 50,
      pnl: -12,
      won: 1,
      lost: 2,
      open: 1,
      openStaked: 20,
      settled: 3,
    })
    expect(r.totals.roi).toBeCloseTo(-12 / 30)
    expect(r.nearMisses).toBe(1)
    expect(r.byMarket.map((l) => l.label)).toContain('Combo')
    expect(r.legs).toMatchObject({ won: 4, lost: 2 })
    expect(r.streak).toEqual({ kind: 'lost', length: 2 })
  })

  it('takes everything for all time', () => {
    const r = buildRecord(entries, { from: null, to: null })
    expect(r.totals.count).toBe(5)
    expect(r.totals.best?.pnl).toBe(100)
    expect(r.totals.worst?.pnl).toBe(-10)
  })
})

describe('calibration', () => {
  const all = { from: null, to: null }
  const at = (
    entryChance: number | null,
    won: boolean,
    over: Partial<RecordEntry> = {},
  ) => entry({ entryChance, result: won ? 'won' : 'lost', ...over })

  it('buckets bets by the chance they were bought at, with actual win rates', () => {
    const c = calibrationOf(
      [
        at(0.22, false),
        at(0.25, true),
        at(0.28, false),
        at(0.62, true),
        at(0.65, true),
        at(0.68, false),
      ],
      all,
    )
    expect(c.count).toBe(6)
    expect(c.buckets.map((b) => [b.count, b.won])).toEqual([
      [3, 1],
      [3, 2],
    ])
    expect(c.buckets[0].from).toBeCloseTo(0.2)
    expect(c.buckets[1].to).toBeCloseTo(0.7)
    expect(c.buckets[0].implied).toBeCloseTo(0.25)
    expect(c.buckets[0].actual).toBeCloseTo(1 / 3)
    // Won 3 of 6 at an average implied 45%: +5 points.
    expect(c.edge).toBeCloseTo(0.5 - 0.45)
  })

  it('merges thin buckets so none rests on a bet or two', () => {
    const c = calibrationOf(
      [at(0.05, false), at(0.15, false), at(0.18, true), at(0.95, true)],
      all,
    )
    expect(c.buckets.map((b) => b.count)).toEqual([4])
  })

  it('leaves out open, void and unpriced bets, and respects the range', () => {
    const c = calibrationOf(
      [
        at(0.5, true),
        entry({ status: 'open', result: null, entryChance: 0.5 }),
        entry({ result: 'void', entryChance: 0.5 }),
        at(null, true),
        at(0.5, false, { madeAt: '2026-08-01T18:00:00Z' }),
      ],
      { from: new Date('2026-09-01T00:00:00Z'), to: null },
    )
    expect(c.count).toBe(1)
    expect(calibrationOf([], all)).toEqual({
      buckets: [],
      edge: null,
      count: 0,
    })
  })
})
