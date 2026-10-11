/**
 * ESPN Fantasy's sports, as Sportsline reads them (docs/adr/0004): game
 * codes, which lineup slots don't count, slot names, and each sport's
 * season year. Pure.
 */

import type { League } from '@/lib/model/types'

const FANTASY_SPORTS = ['football', 'basketball', 'baseball'] as const
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
    notStarting: new Set([16, 17, 18]),
    slotNames: {
      0: 'C',
      1: '1B',
      2: '2B',
      3: '3B',
      4: 'SS',
      5: 'OF',
      6: 'MI',
      7: 'CI',
      8: 'OF',
      9: 'OF',
      10: 'OF',
      11: 'DH',
      12: 'UTIL',
      13: 'P',
      14: 'SP',
      15: 'RP',
      16: 'Bench',
      17: 'IL',
      18: 'IL+',
      19: 'IF',
    },
    slotOrder: [0, 1, 2, 3, 4, 6, 7, 19, 5, 8, 9, 10, 11, 12, 14, 15, 13],
  },
}

/**
 * ESPN's NFL team ids (fantasy pro team ids), which never change: a D/ST's
 * logo and abbreviation come straight from these, not from stored Teams.
 */
export const NFL_PRO_TEAMS: Readonly<Record<number, string>> = {
  1: 'ATL',
  2: 'BUF',
  3: 'CHI',
  4: 'CIN',
  5: 'CLE',
  6: 'DAL',
  7: 'DEN',
  8: 'DET',
  9: 'GB',
  10: 'TEN',
  11: 'IND',
  12: 'KC',
  13: 'LV',
  14: 'LAR',
  15: 'MIA',
  16: 'MIN',
  17: 'NE',
  18: 'NO',
  19: 'NYG',
  20: 'NYJ',
  21: 'PHI',
  22: 'ARI',
  23: 'PIT',
  24: 'LAC',
  25: 'SF',
  26: 'SEA',
  27: 'TB',
  28: 'WSH',
  29: 'CAR',
  30: 'JAX',
  33: 'BAL',
  34: 'HOU',
}

/**
 * ESPN's MLB team ids (fantasy pro team ids) as the MLB Stats API
 * abbreviates them (our MLB Teams' abbreviations): CWS, AZ, ATH.
 */
export const MLB_PRO_TEAMS: Readonly<Record<number, string>> = {
  1: 'BAL',
  2: 'BOS',
  3: 'LAA',
  4: 'CWS',
  5: 'CLE',
  6: 'DET',
  7: 'KC',
  8: 'MIL',
  9: 'MIN',
  10: 'NYY',
  11: 'ATH',
  12: 'SEA',
  13: 'TEX',
  14: 'TOR',
  15: 'ATL',
  16: 'CHC',
  17: 'CIN',
  18: 'HOU',
  19: 'LAD',
  20: 'WSH',
  21: 'NYM',
  22: 'PHI',
  23: 'PIT',
  24: 'STL',
  25: 'SD',
  26: 'SF',
  27: 'COL',
  28: 'MIA',
  29: 'AZ',
  30: 'TB',
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
