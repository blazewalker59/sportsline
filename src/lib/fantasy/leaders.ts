/**
 * A Fantasy league's Scoring leaders (CONTEXT.md, "Scoring leaders"): its
 * top Players and teams this scoring period, read from every team's
 * Lineup in the same league data as the Matchup, so they cost no extra
 * read. Points leagues rank Fantasy points; category leagues name each
 * counting Category's leader today. Pure.
 */

import { formatCategory, isRate } from './categories'
import type { LeagueCategory } from './categories'
import type { LineupPlayer, MatchupSide } from './matchup'
import type { FantasySport } from './sports'

/** A Player as the leaders show them, with the Fantasy team that has them. */
export type LeaderPlayer = Pick<
  LineupPlayer,
  | 'espnId'
  | 'sourcePlayerId'
  | 'headshot'
  | 'playerId'
  | 'name'
  | 'positionId'
  | 'proTeamId'
  | 'teamId'
  | 'teamAbbrev'
  | 'teamLogo'
  | 'starter'
> & {
  /** Fantasy points, or the Category's count. */
  points: number
  fantasyTeamId: number
  fantasyTeam: string
  mine: boolean
}

export interface CategoryLeader {
  statId: number
  label: string
  /** The leader's count, as the Category shows it. */
  value: string
  player: LeaderPlayer
}

export interface TeamLeader {
  teamId: number
  name: string
  abbrev: string
  score: number
  mine: boolean
}

export interface ScoringLeaders {
  scoringPeriod: number
  /** Points leagues: the top Players this scoring period, best first. */
  players: Array<LeaderPlayer>
  /** Category leagues: each counting Category's leader today. */
  categories: Array<CategoryLeader>
  /** Points leagues: every team's score this matchup, best first. */
  teams: Array<TeamLeader>
}

/** How many Players the leaders list. */
export const TOP_PLAYERS = 10

function leaderOf(
  p: LineupPlayer,
  side: MatchupSide,
  mine: number | null,
  points: number,
): LeaderPlayer {
  return {
    espnId: p.espnId,
    ...(p.sourcePlayerId === undefined
      ? {}
      : { sourcePlayerId: p.sourcePlayerId }),
    headshot: p.headshot ?? null,
    playerId: p.playerId ?? null,
    name: p.name,
    positionId: p.positionId,
    proTeamId: p.proTeamId,
    teamId: p.teamId ?? null,
    teamAbbrev: p.teamAbbrev ?? null,
    teamLogo: p.teamLogo ?? null,
    starter: p.starter,
    points,
    fantasyTeamId: side.teamId,
    fantasyTeam: side.abbrev,
    mine: side.teamId === mine,
  }
}

/**
 * The league's Scoring leaders from every team's side. Bench Players
 * count too (marked, not started), so a big game left on a bench shows.
 */
export function scoringLeaders(input: {
  sport: FantasySport
  scoringPeriod: number
  sides: ReadonlyArray<MatchupSide>
  /** The Viewer's team. */
  mine: number | null
  /** Category leagues' Categories (null in a points league). */
  categories: ReadonlyArray<LeagueCategory> | null
}): ScoringLeaders {
  const { sport, sides, mine, categories } = input
  const everyone = sides.flatMap((side) =>
    side.lineup.map((p) => ({ p, side })),
  )
  if (categories) {
    // Counts only: a rate needs volume, and a lowest count (turnovers)
    // isn't leading anything.
    const counted = categories.filter(
      (c) => !c.reverse && !isRate(sport, c.statId),
    )
    return {
      scoringPeriod: input.scoringPeriod,
      players: [],
      teams: [],
      categories: counted.flatMap((c) => {
        let best: { p: LineupPlayer; side: MatchupSide; n: number } | null =
          null
        for (const { p, side } of everyone) {
          const n = p.dayStats?.[c.statId] ?? 0
          if (n > 0 && (!best || n > best.n)) best = { p, side, n }
        }
        return best
          ? [
              {
                statId: c.statId,
                label: c.label,
                value: formatCategory(sport, c.statId, best.n),
                player: leaderOf(best.p, best.side, mine, best.n),
              },
            ]
          : []
      }),
    }
  }
  return {
    scoringPeriod: input.scoringPeriod,
    players: everyone
      .filter(({ p }) => p.points !== null && p.points > 0)
      .sort(
        (a, b) =>
          b.p.points! - a.p.points! ||
          Number(b.p.starter) - Number(a.p.starter),
      )
      .slice(0, TOP_PLAYERS)
      .map(({ p, side }) => leaderOf(p, side, mine, p.points!)),
    categories: [],
    teams: [...sides]
      .sort((a, b) => b.score - a.score || a.teamId - b.teamId)
      .map((s) => ({
        teamId: s.teamId,
        name: s.name,
        abbrev: s.abbrev,
        score: s.score,
        mine: s.teamId === mine,
      })),
  }
}
