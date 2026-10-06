/**
 * Sharp picks' track record (docs/adr/0006): closing line value first
 * (the sharpest early sign a method works), then results and return per
 * contract, overall and by grade. Pure.
 */

import { closingLineValue, profitPerContract } from './engine'

export interface PickOutcome {
  kind: 'single' | 'combo'
  grade: 'strong' | 'edge' | 'thin'
  price: number
  fair: number
  closingPrice: number | null
  result: 'won' | 'lost' | 'void' | null
}

export interface PickLine {
  label: string
  picks: number
  /** With a closing price: how many beat it, and by how much on average. */
  closed: number
  beatClose: number
  avgClv: number | null
  won: number
  lost: number
  /** Profit per contract summed, over what those contracts cost. */
  roi: number | null
}

function lineOf(label: string, picks: ReadonlyArray<PickOutcome>): PickLine {
  const closed = picks.filter((p) => p.closingPrice !== null)
  const clvs = closed.map((p) => closingLineValue(p.price, p.closingPrice!))
  const decided = picks.filter(
    (p): p is PickOutcome & { result: 'won' | 'lost' } =>
      p.result === 'won' || p.result === 'lost',
  )
  const cost = decided.reduce((n, p) => n + p.price, 0)
  return {
    label,
    picks: picks.length,
    closed: closed.length,
    beatClose: clvs.filter((c) => c > 0).length,
    avgClv: clvs.length ? clvs.reduce((n, c) => n + c, 0) / clvs.length : null,
    won: decided.filter((p) => p.result === 'won').length,
    lost: decided.filter((p) => p.result === 'lost').length,
    roi:
      cost > 0
        ? decided.reduce(
            (n, p) => n + profitPerContract(p.price, p.result),
            0,
          ) / cost
        : null,
  }
}

export interface PicksRecord {
  all: PickLine
  singles: PickLine
  combos: PickLine
  byGrade: Array<PickLine>
}

export function picksRecord(picks: ReadonlyArray<PickOutcome>): PicksRecord {
  const singles = picks.filter((p) => p.kind === 'single')
  return {
    all: lineOf('All picks', picks),
    singles: lineOf('Singles', singles),
    combos: lineOf(
      'Combos',
      picks.filter((p) => p.kind === 'combo'),
    ),
    byGrade: (['strong', 'edge', 'thin'] as const).map((g) =>
      lineOf(
        g === 'strong' ? 'Strong' : g === 'edge' ? 'Edge' : 'Thin',
        singles.filter((p) => p.grade === g),
      ),
    ),
  }
}
