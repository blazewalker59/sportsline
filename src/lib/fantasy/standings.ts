/**
 * A Fantasy league's Standings (CONTEXT.md, "Standings"): every team's
 * place, record, points for and against, and streak, read from the same
 * league views as the Matchup (ESPN's mTeam and mSettings), so they cost
 * no extra read. Pure.
 */

import { teamName } from './matchup'
import type { WireLeague } from './matchup'

export interface StandingsRow {
  teamId: number
  name: string
  abbrev: string
  logo: string | null
  /** Place in the league, 1 first. */
  rank: number
  wins: number
  losses: number
  ties: number
  /** Points leagues: Fantasy points scored and allowed this season. */
  pointsFor: number | null
  pointsAgainst: number | null
  /** "W3", "L1": the current run of results (null before any). */
  streak: string | null
  /** The Viewer's team. */
  mine: boolean
}

export interface Standings {
  /** First place to last. */
  rows: Array<StandingsRow>
  /** How many teams make the playoffs (null when the league doesn't say). */
  playoffTeams: number | null
}

const round = (n: number) => Math.round(n * 100) / 100

const STREAK: Record<string, string> = { WIN: 'W', LOSS: 'L', TIE: 'T' }

/**
 * Places by win percentage, then points for: how a provider without its
 * own ranking (or a team it hasn't ranked yet) is placed.
 */
export function ranked(
  rows: ReadonlyArray<Omit<StandingsRow, 'rank'>>,
): Array<StandingsRow> {
  const pct = (r: Omit<StandingsRow, 'rank'>) => {
    const games = r.wins + r.losses + r.ties
    return games === 0 ? 0 : (r.wins + r.ties / 2) / games
  }
  return [...rows]
    .sort(
      (a, b) =>
        pct(b) - pct(a) ||
        (b.pointsFor ?? 0) - (a.pointsFor ?? 0) ||
        a.teamId - b.teamId,
    )
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

/**
 * ESPN's Standings in ESPN's order: its playoff seed (the current
 * standings, set even before Week 1), else its final place, else by record.
 */
export function readStandings(
  league: WireLeague,
  mine: number | null,
): Standings | null {
  const teams = league.teams ?? []
  if (teams.length === 0) return null
  const points = !/CATEGORY|ROTO/.test(
    league.settings?.scoringSettings?.scoringType ?? '',
  )
  const rows = teams.map((t) => {
    const o = t.record?.overall
    const name = teamName(t)
    return {
      teamId: t.id,
      name,
      abbrev: t.abbrev ?? name.slice(0, 4).toUpperCase(),
      logo: t.logo ?? null,
      wins: o?.wins ?? 0,
      losses: o?.losses ?? 0,
      ties: o?.ties ?? 0,
      pointsFor: points && o?.pointsFor != null ? round(o.pointsFor) : null,
      pointsAgainst:
        points && o?.pointsAgainst != null ? round(o.pointsAgainst) : null,
      streak:
        o?.streakLength && o.streakType && STREAK[o.streakType]
          ? `${STREAK[o.streakType]}${o.streakLength}`
          : null,
      mine: t.id === mine,
    }
  })
  const place = (t: (typeof teams)[number]) =>
    t.playoffSeed || t.rankCalculatedFinal || 0
  const placed = teams.every((t) => place(t) > 0)
  const byId = new Map(teams.map((t) => [t.id, t]))
  return {
    rows: placed
      ? rows
          .map((r) => ({ ...r, rank: place(byId.get(r.teamId)!) }))
          .sort((a, b) => a.rank - b.rank)
      : ranked(rows),
    playoffTeams: league.settings?.scheduleSettings?.playoffTeamCount ?? null,
  }
}
