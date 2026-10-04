/**
 * ESPN Fantasy stat ids, named for a point breakdown ("Rec yds 87 → 8.7").
 * From the ids long used by open ESPN fantasy clients; an id not listed
 * shows as "Stat 123" rather than being hidden. Pure.
 */

import type { FantasySport } from './sports'

const FOOTBALL: Record<number, string> = {
  0: 'Pass att',
  1: 'Completions',
  3: 'Pass yds',
  4: 'Pass TD',
  15: 'Pass 40+ yd TD',
  16: 'Pass 50+ yd TD',
  17: 'Pass 300-399 yds',
  18: 'Pass 400+ yds',
  19: 'Pass 2-pt',
  20: 'Interceptions thrown',
  23: 'Rush att',
  24: 'Rush yds',
  25: 'Rush TD',
  26: 'Rush 2-pt',
  35: 'Rush 40+ yd TD',
  36: 'Rush 50+ yd TD',
  37: 'Rush 100-199 yds',
  38: 'Rush 200+ yds',
  41: 'Receptions',
  42: 'Rec yds',
  43: 'Rec TD',
  44: 'Rec 2-pt',
  45: 'Rec 40+ yd TD',
  46: 'Rec 50+ yd TD',
  53: 'Receptions',
  56: 'Rec 100-199 yds',
  57: 'Rec 200+ yds',
  58: 'Targets',
  63: 'Fumble return TD',
  68: 'Fumbles',
  72: 'Fumbles lost',
  74: 'FG 50+',
  77: 'FG 40-49',
  80: 'FG 0-39',
  83: 'FG made',
  84: 'FG att',
  85: 'FG missed',
  86: 'PAT made',
  87: 'PAT att',
  88: 'PAT missed',
  89: '0 pts allowed',
  90: '1-6 pts allowed',
  91: '7-13 pts allowed',
  92: '14-17 pts allowed',
  93: 'Blocked kick TD',
  94: 'Defensive TD',
  95: 'Interceptions',
  96: 'Fumbles recovered',
  97: 'Blocked kicks',
  98: 'Safeties',
  99: 'Sacks',
  101: 'Kick return TD',
  102: 'Punt return TD',
  103: 'Fumble return TD',
  104: 'INT return TD',
  120: 'Pts allowed',
  121: '18-20 pts allowed',
  122: '21-27 pts allowed',
  123: '28-34 pts allowed',
  124: '35-45 pts allowed',
  125: '46+ pts allowed',
  127: 'Yds allowed',
  128: '0-99 yds allowed',
  129: '100-199 yds allowed',
  130: '200-299 yds allowed',
  131: '300-349 yds allowed',
  132: '350-399 yds allowed',
  133: '400-449 yds allowed',
  134: '450-499 yds allowed',
  135: '500-549 yds allowed',
  136: '550+ yds allowed',
  198: 'FG 50-59',
  201: 'FG 60+',
  206: 'Two-point return',
}

const BASKETBALL: Record<number, string> = {
  0: 'Points',
  1: 'Blocks',
  2: 'Steals',
  3: 'Assists',
  6: 'Rebounds',
  11: 'Turnovers',
  13: 'FG made',
  14: 'FG att',
  15: 'FT made',
  16: 'FT att',
  17: '3PT made',
  18: '3PT att',
  37: 'Double-double',
  38: 'Triple-double',
}

const BASEBALL: Record<number, string> = {
  0: 'At bats',
  1: 'Hits',
  3: 'Doubles',
  4: 'Triples',
  5: 'Home runs',
  8: 'Total bases',
  10: 'Walks',
  12: 'Hit by pitch',
  20: 'Runs',
  21: 'RBI',
  23: 'Stolen bases',
  24: 'Caught stealing',
  27: 'Strikeouts (batting)',
  34: 'Outs pitched',
  37: 'Hits allowed',
  39: 'Walks allowed',
  45: 'Earned runs',
  48: 'Strikeouts',
  53: 'Wins',
  54: 'Losses',
  57: 'Saves',
  60: 'Holds',
  63: 'Quality starts',
}

const NAMES: Record<FantasySport, Record<number, string>> = {
  football: FOOTBALL,
  basketball: BASKETBALL,
  baseball: BASEBALL,
}

export function statName(sport: FantasySport, statId: number): string {
  return NAMES[sport][statId] ?? `Stat ${statId}`
}

/** A stat's value as read: whole numbers plain, else one decimal. */
export function statValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
