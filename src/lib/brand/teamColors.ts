/**
 * Team colors, generated once from ESPN's team lists (none of our MLB or NHL
 * Sources publish colors). Keyed by League and normalized team name, so they
 * apply whichever Source named the Team. Regenerate when a franchise
 * rebrands.
 */

import type { League } from '@/lib/model/types'

export interface TeamColors {
  primary: string
  secondary: string
}

/** Lower case, no accents or punctuation: "Montréal Canadiens" → "montreal canadiens". */
export function normalizeTeamName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const COLORS: Record<string, readonly [string, string]> = {
  'mlb:arizona diamondbacks': ['#aa182c', '#000000'],
  'mlb:athletics': ['#003831', '#efb21e'],
  'mlb:atlanta braves': ['#0c2340', '#ba0c2f'],
  'mlb:baltimore orioles': ['#df4601', '#000000'],
  'mlb:boston red sox': ['#0d2b56', '#bd3039'],
  'mlb:chicago cubs': ['#0e3386', '#cc3433'],
  'mlb:chicago white sox': ['#000000', '#c4ced4'],
  'mlb:cincinnati reds': ['#c6011f', '#ffffff'],
  'mlb:cleveland guardians': ['#002b5c', '#e31937'],
  'mlb:colorado rockies': ['#33006f', '#000000'],
  'mlb:detroit tigers': ['#0a2240', '#ff4713'],
  'mlb:houston astros': ['#002d62', '#eb6e1f'],
  'mlb:kansas city royals': ['#004687', '#7ab2dd'],
  'mlb:los angeles angels': ['#ba0021', '#c4ced4'],
  'mlb:los angeles dodgers': ['#005a9c', '#ffffff'],
  'mlb:miami marlins': ['#00a3e0', '#000000'],
  'mlb:milwaukee brewers': ['#13294b', '#ffc72c'],
  'mlb:minnesota twins': ['#031f40', '#e20e32'],
  'mlb:new york mets': ['#002d72', '#ff5910'],
  'mlb:new york yankees': ['#132448', '#c4ced4'],
  'mlb:philadelphia phillies': ['#e81828', '#003278'],
  'mlb:pittsburgh pirates': ['#000000', '#fdb827'],
  'mlb:san diego padres': ['#2f241d', '#ffc425'],
  'mlb:san francisco giants': ['#000000', '#fd5a1e'],
  'mlb:seattle mariners': ['#005c5c', '#0c2c56'],
  'mlb:st louis cardinals': ['#be0a14', '#001541'],
  'mlb:tampa bay rays': ['#092c5c', '#8fbce6'],
  'mlb:texas rangers': ['#003278', '#c0111f'],
  'mlb:toronto blue jays': ['#134a8e', '#6cace5'],
  'mlb:washington nationals': ['#ab0003', '#11225b'],
  'nba:atlanta hawks': ['#c8102e', '#fdb927'],
  'nba:boston celtics': ['#008348', '#ffffff'],
  'nba:brooklyn nets': ['#000000', '#ffffff'],
  'nba:charlotte hornets': ['#008ca8', '#1d1060'],
  'nba:chicago bulls': ['#ce1141', '#000000'],
  'nba:cleveland cavaliers': ['#860038', '#bc945c'],
  'nba:dallas mavericks': ['#0064b1', '#bbc4ca'],
  'nba:denver nuggets': ['#0e2240', '#fec524'],
  'nba:detroit pistons': ['#1d428a', '#c8102e'],
  'nba:golden state warriors': ['#fdb927', '#1d428a'],
  'nba:houston rockets': ['#ce0e2d', '#000000'],
  'nba:indiana pacers': ['#0c2340', '#ffd520'],
  'nba:la clippers': ['#12173f', '#c8102e'],
  'nba:los angeles lakers': ['#552583', '#fdb927'],
  'nba:memphis grizzlies': ['#5d76a9', '#12173f'],
  'nba:miami heat': ['#98002e', '#000000'],
  'nba:milwaukee bucks': ['#00471b', '#eee1c6'],
  'nba:minnesota timberwolves': ['#266092', '#79bc43'],
  'nba:new orleans pelicans': ['#0a2240', '#b4975a'],
  'nba:new york knicks': ['#1d428a', '#f58426'],
  'nba:oklahoma city thunder': ['#007ac1', '#ef3b24'],
  'nba:orlando magic': ['#0150b5', '#9ca0a3'],
  'nba:philadelphia 76ers': ['#1d428a', '#e01234'],
  'nba:phoenix suns': ['#29127a', '#e56020'],
  'nba:portland trail blazers': ['#e03a3e', '#000000'],
  'nba:sacramento kings': ['#5a2d81', '#6a7a82'],
  'nba:san antonio spurs': ['#000000', '#c4ced4'],
  'nba:toronto raptors': ['#d91244', '#000000'],
  'nba:utah jazz': ['#4e008e', '#79a3dc'],
  'nba:washington wizards': ['#e31837', '#002b5c'],
  'nfl:arizona cardinals': ['#a40227', '#ffffff'],
  'nfl:atlanta falcons': ['#a71930', '#000000'],
  'nfl:baltimore ravens': ['#29126f', '#000000'],
  'nfl:buffalo bills': ['#00338d', '#d50a0a'],
  'nfl:carolina panthers': ['#0085ca', '#000000'],
  'nfl:chicago bears': ['#0b1c3a', '#e64100'],
  'nfl:cincinnati bengals': ['#fb4f14', '#000000'],
  'nfl:cleveland browns': ['#472a08', '#ff3c00'],
  'nfl:dallas cowboys': ['#002a5c', '#b0b7bc'],
  'nfl:denver broncos': ['#0a2343', '#fc4c02'],
  'nfl:detroit lions': ['#0076b6', '#bbbbbb'],
  'nfl:green bay packers': ['#204e32', '#ffb612'],
  'nfl:houston texans': ['#021018', '#eb0028'],
  'nfl:indianapolis colts': ['#003b75', '#ffffff'],
  'nfl:jacksonville jaguars': ['#007487', '#d7a22a'],
  'nfl:kansas city chiefs': ['#e31837', '#ffb612'],
  'nfl:las vegas raiders': ['#000000', '#a5acaf'],
  'nfl:los angeles chargers': ['#0080c6', '#ffc20e'],
  'nfl:los angeles rams': ['#003594', '#ffd100'],
  'nfl:miami dolphins': ['#008e97', '#fc4c02'],
  'nfl:minnesota vikings': ['#4f2683', '#ffc62f'],
  'nfl:new england patriots': ['#002a5c', '#c60c30'],
  'nfl:new orleans saints': ['#d3bc8d', '#000000'],
  'nfl:new york giants': ['#003c7f', '#c9243f'],
  'nfl:new york jets': ['#115740', '#ffffff'],
  'nfl:philadelphia eagles': ['#06424d', '#000000'],
  'nfl:pittsburgh steelers': ['#000000', '#ffb612'],
  'nfl:san francisco 49ers': ['#aa0000', '#b3995d'],
  'nfl:seattle seahawks': ['#002a5c', '#69be28'],
  'nfl:tampa bay buccaneers': ['#bd1c36', '#3e3a35'],
  'nfl:tennessee titans': ['#4495d2', '#001532'],
  'nfl:washington commanders': ['#5a1414', '#ffb612'],
  'nhl:anaheim ducks': ['#fc4c02', '#000000'],
  'nhl:boston bruins': ['#231f20', '#fdb71a'],
  'nhl:buffalo sabres': ['#00468b', '#fdb71a'],
  'nhl:calgary flames': ['#dd1a32', '#000000'],
  'nhl:carolina hurricanes': ['#e30426', '#000000'],
  'nhl:chicago blackhawks': ['#e31937', '#000000'],
  'nhl:colorado avalanche': ['#860038', '#005ea3'],
  'nhl:columbus blue jackets': ['#002d62', '#e31937'],
  'nhl:dallas stars': ['#20864c', '#000000'],
  'nhl:detroit red wings': ['#e30526', '#ffffff'],
  'nhl:edmonton oilers': ['#00205b', '#ff4c00'],
  'nhl:florida panthers': ['#e51937', '#002d62'],
  'nhl:los angeles kings': ['#121212', '#a2aaad'],
  'nhl:minnesota wild': ['#124734', '#ae122a'],
  'nhl:montreal canadiens': ['#c41230', '#013a81'],
  'nhl:nashville predators': ['#fdba31', '#002d62'],
  'nhl:new jersey devils': ['#e30b2b', '#000000'],
  'nhl:new york islanders': ['#00529b', '#f47d31'],
  'nhl:new york rangers': ['#0056ae', '#e51937'],
  'nhl:ottawa senators': ['#dd1a32', '#b79257'],
  'nhl:philadelphia flyers': ['#fe5823', '#000000'],
  'nhl:pittsburgh penguins': ['#000000', '#fdb71a'],
  'nhl:san jose sharks': ['#00788a', '#070707'],
  'nhl:seattle kraken': ['#000d33', '#a3dce4'],
  'nhl:st louis blues': ['#0070b9', '#fdb71a'],
  'nhl:tampa bay lightning': ['#003e7e', '#ffffff'],
  'nhl:toronto maple leafs': ['#003e7e', '#ffffff'],
  'nhl:utah mammoth': ['#000000', '#7ab2e1'],
  'nhl:vancouver canucks': ['#003e7e', '#008752'],
  'nhl:vegas golden knights': ['#344043', '#b4975a'],
  'nhl:washington capitals': ['#d71830', '#0b1f41'],
  'nhl:winnipeg jets': ['#002d62', '#c41230'],
}

export function teamColors(league: League, name: string): TeamColors | null {
  const c = COLORS[`${league}:${normalizeTeamName(name)}`]
  return c ? { primary: c[0], secondary: c[1] } : null
}
