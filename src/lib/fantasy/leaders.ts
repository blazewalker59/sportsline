/**
 * A Fantasy league's Scoring leaders (CONTEXT.md, "Scoring leaders"): its
 * top Players and teams this scoring period, read from every team's
 * Lineup in the same league data as the Matchup, so they cost no extra
 * read. Points leagues rank Fantasy points, overall and by position;
 * category leagues rank each Category's top Players, today and over the
 * whole matchup. Pure.
 */

import { categoryValue, formatCategory, rateVolume } from './categories'
import type { CategoryResult, LeagueCategory } from './categories'
import type { LineupPlayer, MatchupSide, MatchupView } from './matchup'
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

/** A Player's place in a Category: `points` holds their value. */
export type CategoryPlace = LeaderPlayer & {
  /** Their value, as the Category shows it. */
  value: string
  /** A rate's parts: "8-15", "5.1 IP". */
  parts?: string
}

/** One Category's top Players, its leader first. */
export interface CategoryLeaders {
  statId: number
  label: string
  /**
   * Lower wins (ERA, turnovers): a rate then ranks lowest first, and a
   * count most first, as who's costing their side the Category.
   */
  reverse: boolean
  /** A rate's volume to rank: "5+ FGA". */
  minimum?: string
  /** At most TOP_PLAYERS. */
  players: Array<CategoryPlace>
}

/** A Fantasy team's place in a Category: its total, as the Category shows it. */
export interface TeamPlace {
  teamId: number
  name: string
  abbrev: string
  value: string
  mine: boolean
}

/** One Category's every team, its leader first. */
export interface TeamCategoryLeaders {
  statId: number
  label: string
  /** Lower wins (ERA, turnovers): ranked lowest first. */
  reverse: boolean
  /** Every team with a total, best first. */
  teams: Array<TeamPlace>
}

export interface TeamLeader {
  teamId: number
  name: string
  abbrev: string
  score: number
  mine: boolean
}

export interface PositionLeaders {
  /** ESPN's position id (fantasy/sports.ts). */
  positionId: number
  /** Best first. */
  players: Array<LeaderPlayer>
}

export interface ScoringLeaders {
  scoringPeriod: number
  /** Points leagues: the top Players this scoring period, best first. */
  players: Array<LeaderPlayer>
  /** Points leagues: each position's top Players this scoring period. */
  positions?: Array<PositionLeaders>
  /** Category leagues: each Category's top Players today. */
  categories: Array<CategoryLeaders>
  /** Category leagues: each Category's top Players over the matchup. */
  matchupCategories?: Array<CategoryLeaders>
  /** Category leagues: each Category's teams ranked on today's Starters. */
  teamCategories?: Array<TeamCategoryLeaders>
  /** Category leagues: each Category's teams ranked over the matchup. */
  matchupTeamCategories?: Array<TeamCategoryLeaders>
  /** Points leagues: every team's score this matchup, best first. */
  teams: Array<TeamLeader>
}

/** How many Players the leaders list. */
export const TOP_PLAYERS = 10

/** How many Players each position lists. */
export const TOP_AT_POSITION = 15

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
  /**
   * Category leagues: every team's Matchup read as its own (ESPN), whose
   * totals rank the teams in each Category.
   */
  teamViews?: ReadonlyArray<Pick<MatchupView, 'mine' | 'categories' | 'today'>>
}): ScoringLeaders {
  const { sport, sides, mine, categories, teamViews } = input
  const everyone = sides.flatMap((side) =>
    side.lineup.map((p) => ({ p, side })),
  )
  if (categories) {
    // The matchup's lines: each side's summary (who counted, and how much).
    const matchup = sides.flatMap((side) =>
      (side.summary ?? []).map((p) => ({ p, side })),
    )
    const leadersOf = (
      lines: ReadonlyArray<{ p: LineupPlayer; side: MatchupSide }>,
      span: 'day' | 'matchup',
    ): Array<CategoryLeaders> =>
      categories.flatMap((c) => {
        // A rate ranks only those with the volume behind it; a count,
        // anyone with one.
        const rate = rateVolume(sport, c.statId, span)
        const ranked = lines
          .flatMap(({ p, side }) => {
            const s = p.dayStats ?? {}
            const volume = rate ? rate.of(s) : 0
            if (rate && volume < rate.minimum) return []
            const n = categoryValue(sport, c.statId, s)
            if (n === null || !Number.isFinite(n) || (!rate && n <= 0))
              return []
            return [{ p, side, n, volume }]
          })
          .sort(
            (a, b) =>
              (rate && c.reverse ? a.n - b.n : b.n - a.n) ||
              b.volume - a.volume ||
              Number(b.p.starter) - Number(a.p.starter),
          )
          .slice(0, TOP_PLAYERS)
        if (ranked.length === 0) return []
        return [
          {
            statId: c.statId,
            label: c.label,
            reverse: c.reverse,
            ...(rate ? { minimum: rate.label } : {}),
            players: ranked.map(({ p, side, n }) => {
              const parts = rate?.parts(p.dayStats ?? {})
              return {
                ...leaderOf(p, side, mine, n),
                value: formatCategory(sport, c.statId, n),
                ...(parts ? { parts } : {}),
              }
            }),
          },
        ]
      })
    return {
      scoringPeriod: input.scoringPeriod,
      players: [],
      teams: [],
      categories: leadersOf(everyone, 'day'),
      matchupCategories: leadersOf(matchup, 'matchup'),
      ...(teamViews && teamViews.length > 0
        ? {
            teamCategories: teamRanks(categories, teamViews, mine, 'today'),
            matchupTeamCategories: teamRanks(
              categories,
              teamViews,
              mine,
              'categories',
            ),
          }
        : {}),
    }
  }
  const scored = everyone
    .filter(({ p }) => p.points !== null && p.points > 0)
    .sort(
      (a, b) =>
        b.p.points! - a.p.points! || Number(b.p.starter) - Number(a.p.starter),
    )
  const positionIds = [
    ...new Set(
      scored.flatMap(({ p }) => (p.positionId === null ? [] : [p.positionId])),
    ),
  ].sort((a, b) => a - b)
  return {
    scoringPeriod: input.scoringPeriod,
    players: scored
      .slice(0, TOP_PLAYERS)
      .map(({ p, side }) => leaderOf(p, side, mine, p.points!)),
    positions: positionIds.map((positionId) => ({
      positionId,
      players: scored
        .filter(({ p }) => p.positionId === positionId)
        .slice(0, TOP_AT_POSITION)
        .map(({ p, side }) => leaderOf(p, side, mine, p.points!)),
    })),
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

/**
 * Each Category's teams, best first (lowest where lower wins), from each
 * team's own totals: today's Starters, or the matchup so far. A team
 * with no total yet (no attempts, no innings) is left out.
 */
function teamRanks(
  categories: ReadonlyArray<LeagueCategory>,
  views: ReadonlyArray<Pick<MatchupView, 'mine' | 'categories' | 'today'>>,
  mine: number | null,
  span: 'today' | 'categories',
): Array<TeamCategoryLeaders> {
  return categories.flatMap((c) => {
    const ranked = views
      .flatMap((v) => {
        const r = (v[span] ?? []).find(
          (x: CategoryResult) => x.statId === c.statId,
        )
        const n = r?.mineValue
        return r && n != null
          ? [
              {
                n,
                place: {
                  teamId: v.mine.teamId,
                  name: v.mine.name,
                  abbrev: v.mine.abbrev,
                  value: r.mine,
                  mine: v.mine.teamId === mine,
                },
              },
            ]
          : []
      })
      .sort(
        (a, b) =>
          (c.reverse ? a.n - b.n : b.n - a.n) ||
          a.place.teamId - b.place.teamId,
      )
    return ranked.length === 0
      ? []
      : [
          {
            statId: c.statId,
            label: c.label,
            reverse: c.reverse,
            teams: ranked.map((t) => t.place),
          },
        ]
  })
}

/**
 * Leaders as kept, or null when they were kept before each Category
 * ranked its top Players (they're rewritten at the league's next sync).
 */
export function currentLeaders(
  leaders: ScoringLeaders | null,
): ScoringLeaders | null {
  if (!leaders) return null
  const kept = [...leaders.categories, ...(leaders.matchupCategories ?? [])]
  return kept.every((c) => Array.isArray(c.players)) ? leaders : null
}
