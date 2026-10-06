/**
 * ESPN Fantasy reads (docs/adr/0004), always with the Viewer's own session
 * cookies and never cached across Viewers. Server only. ESPN rejects
 * requests without a browser User-Agent, which Workers don't send.
 */

import { SPORTS } from './sports'
import type { FantasySport } from './sports'
import type { WireLeague } from './matchup'
import { fetchWithRetry } from '@/lib/sources/pool'

export interface EspnSession {
  swid: string
  espnS2: string
}

export class EspnError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

/** SWID as ESPN expects it: an upper-case GUID in braces. */
export function bracedSwid(swid: string): string {
  return `{${swid.trim().replace(/[{}]/g, '').toUpperCase()}}`
}

async function get<T>(url: string, session: EspnSession | null): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': USER_AGENT,
  }
  if (session) {
    headers.cookie = `espn_s2=${session.espnS2}; SWID=${bracedSwid(session.swid)}`
  }
  const res = await fetchWithRetry(url, { headers })
  if (!res.ok) {
    throw new EspnError(res.status, `ESPN ${res.status}`)
  }
  return (await res.json()) as T
}

/**
 * The Viewer's fan profile, which lists their Fantasy leagues; null when
 * ESPN has no profile under their SWID ("fan not found"). ESPN's own site
 * asks with the braced SWID, so that's tried first, then the bare GUID.
 */
export async function fanProfile(session: EspnSession): Promise<unknown> {
  const braced = bracedSwid(session.swid)
  for (const id of [encodeURIComponent(braced), braced.replace(/[{}]/g, '')]) {
    try {
      return await get(
        `https://fan.api.espn.com/apis/v2/fans/${id}?displayEvents=true&displayNow=true&context=fantasy&source=espn&lang=en&region=us`,
        session,
      )
    } catch (error) {
      if (!(error instanceof EspnError && error.status === 404)) throw error
    }
  }
  return null
}

/** A league's teams, Lineups, this period's Matchups and settings. */
export function leagueViews(
  session: EspnSession | null,
  sport: FantasySport,
  season: number,
  leagueId: string,
): Promise<WireLeague> {
  const views = ['mTeam', 'mRoster', 'mMatchup', 'mMatchupScore', 'mSettings']
  return get(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${SPORTS[sport].code}/seasons/${season}/segments/0/leagues/${encodeURIComponent(leagueId)}?${views.map((v) => `view=${v}`).join('&')}`,
    session,
  )
}
