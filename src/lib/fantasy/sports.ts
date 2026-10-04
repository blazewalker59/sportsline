/**
 * ESPN Fantasy's sports, as Sportsline reads them (docs/adr/0004): game
 * codes, which lineup slots don't count, slot names, and each sport's
 * season year. Pure.
 */

import type { League } from '@/lib/model/types'

export const FANTASY_SPORTS = ['football', 'basketball', 'baseball'] as const
export type FantasySport = (typeof FANTASY_SPORTS)[number]

interface SportConfig {
  /** ESPN's fantasy game code. */
  code: 'ffl' | 'fba' | 'flb'
  /** Our League its players play in. */
  league: League
  /** The Source our Players come from, when it's ESPN (ids match). */
  playerSource: string | null
  /** Lineup slots whose players don't count: bench and injured reserve. */
  notStarting: ReadonlySet<number>
  slotNames: Readonly<Record<number, string>>
  /** Starting slots in the order a Lineup is read, top to bottom. */
  slotOrder: ReadonlyArray<number>
}

export const SPORTS: Record<FantasySport, SportConfig> = {
  football: {
    code: 'ffl',
    league: 'nfl',
    playerSource: 'espn',
    notStarting: new Set([20, 21]),
    slotNames: {
      0: 'QB',
      2: 'RB',
      3: 'RB/WR',
      4: 'WR',
      5: 'WR/TE',
      6: 'TE',
      7: 'OP',
      16: 'D/ST',
      17: 'K',
      20: 'Bench',
      21: 'IR',
      23: 'FLEX',
    },
    slotOrder: [0, 2, 3, 4, 5, 6, 23, 7, 16, 17],
  },
  basketball: {
    code: 'fba',
    league: 'nba',
    playerSource: 'espn-nba',
    notStarting: new Set([12, 13]),
    slotNames: {
      0: 'PG',
      1: 'SG',
      2: 'SF',
      3: 'PF',
      4: 'C',
      5: 'G',
      6: 'F',
      7: 'SG/SF',
      8: 'G/F',
      9: 'PF/C',
      10: 'F/C',
      11: 'UTIL',
      12: 'Bench',
      13: 'IR',
    },
    slotOrder: [0, 1, 5, 2, 3, 6, 7, 8, 4, 9, 10, 11],
  },
  baseball: {
    code: 'flb',
    league: 'mlb',
    playerSource: null,
    notStarting: new Set([16, 17]),
    slotNames: {
      0: 'C',
      1: '1B',
      2: '2B',
      3: '3B',
      4: 'SS',
      5: 'OF',
      6: '2B/SS',
      7: '1B/3B',
      12: 'UTIL',
      13: 'P',
      14: 'SP',
      15: 'RP',
      16: 'Bench',
      17: 'IL',
    },
    slotOrder: [0, 1, 2, 3, 4, 6, 7, 5, 12, 14, 15, 13],
  },
}

/** ESPN's game code back to our sport. */
export function sportOfCode(code: string): FantasySport | null {
  return FANTASY_SPORTS.find((s) => SPORTS[s].code === code) ?? null
}

/**
 * The season ESPN files a league under at `now`: football's runs into
 * the new year (January–March count as last season), basketball's is
 * named for the year it ends (October onward is next year's), baseball's
 * is the calendar year.
 */
export function seasonOf(sport: FantasySport, now: Date): number {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  if (sport === 'football') return month < 3 ? year - 1 : year
  if (sport === 'basketball') return month >= 9 ? year + 1 : year
  return year
}

export function slotName(sport: FantasySport, slotId: number): string {
  return SPORTS[sport].slotNames[slotId] ?? `Slot ${slotId}`
}
