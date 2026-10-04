/**
 * The Viewer's Fantasy leagues from ESPN's fan profile
 * (fan.api.espn.com/apis/v2/fans/{SWID}). Its shape isn't documented and
 * has moved over the years, so both known forms are read: preference
 * entries (`metaData.entry` with `groups[].groupId` and a game id), and
 * flat league rows. Pure.
 */

import { sportOfCode } from './sports'
import type { FantasySport } from './sports'

export interface DiscoveredLeague {
  sport: FantasySport
  leagueId: string
  season: number | null
  teamId: number | null
  name: string
  teamName: string | null
}

/** ESPN's fantasy game ids. */
const GAME_IDS: Record<number, FantasySport> = {
  1: 'football',
  2: 'baseball',
  3: 'basketball',
}

type Row = Record<string, unknown>
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null
const num = (v: unknown) =>
  typeof v === 'number' ? v : typeof v === 'string' && v ? Number(v) : null
const str = (v: unknown) =>
  typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : null

function fromEntry(entry: Row): DiscoveredLeague | null {
  const groups = Array.isArray(entry.groups) ? entry.groups.filter(isRow) : []
  const group = groups[0]
  const leagueId = str(group?.groupId) ?? str(entry.leagueId)
  const gameId = num(entry.gameId)
  const sport =
    (gameId !== null ? GAME_IDS[gameId] : undefined) ??
    sportOfCode(str(entry.gameAbbrev) ?? str(entry.abbrevGame) ?? '')
  if (!leagueId || !sport) return null
  const teamName = [str(entry.entryLocation), str(entry.entryNickname)]
    .filter(Boolean)
    .join(' ')
  return {
    sport,
    leagueId,
    season: num(entry.seasonId),
    teamId: num(entry.entryId),
    name: str(group?.groupName) ?? `League ${leagueId}`,
    teamName: teamName || null,
  }
}

function fromFlat(row: Row, sport: FantasySport): DiscoveredLeague | null {
  const leagueId = str(row.leagueId) ?? str(row.league_id)
  if (!leagueId) return null
  return {
    sport,
    leagueId,
    season: num(row.seasonId),
    teamId: num(row.teamId),
    name: str(row.leagueName) ?? str(row.name) ?? `League ${leagueId}`,
    teamName: str(row.teamName),
  }
}

const FLAT_KEYS: Record<string, FantasySport> = {
  fantasyFootball: 'football',
  fantasyBasketball: 'basketball',
  fantasyBaseball: 'baseball',
}

export function discoverLeagues(profile: unknown): Array<DiscoveredLeague> {
  const found: Array<DiscoveredLeague> = []
  const add = (l: DiscoveredLeague | null) => {
    if (!l) return
    const same = found.find(
      (f) => f.sport === l.sport && f.leagueId === l.leagueId,
    )
    if (!same) found.push(l)
    else {
      same.teamId ??= l.teamId
      same.teamName ??= l.teamName
    }
  }
  if (!isRow(profile)) return found
  const prefs = profile.preferences
  // Form 1: preference entries.
  if (Array.isArray(prefs)) {
    for (const p of prefs.filter(isRow)) {
      const meta = isRow(p.metaData) ? p.metaData : null
      if (meta && isRow(meta.entry)) add(fromEntry(meta.entry))
    }
  }
  // Form 2: flat rows grouped by sport.
  if (isRow(prefs)) {
    for (const [key, sport] of Object.entries(FLAT_KEYS)) {
      const rows = prefs[key]
      if (Array.isArray(rows))
        for (const r of rows.filter(isRow)) add(fromFlat(r, sport))
    }
  }
  return found
}

/** A league id from a pasted ESPN league URL ("…/league?leagueId=123…"). */
export function leagueFromUrl(
  input: string,
): { sport: FantasySport; leagueId: string; teamId: number | null } | null {
  const sport = /fantasy\.espn\.com\/(football|basketball|baseball)\//.exec(
    input,
  )?.[1] as FantasySport | undefined
  const leagueId = /[?&]leagueId=(\d+)/.exec(input)?.[1]
  const teamId = /[?&]teamId=(\d+)/.exec(input)?.[1]
  if (!sport || !leagueId) return null
  return { sport, leagueId, teamId: teamId ? Number(teamId) : null }
}
