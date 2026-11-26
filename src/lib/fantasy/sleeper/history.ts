/**
 * One Sleeper season as a league's History keeps it (fantasy/history.ts).
 * Sleeper makes a new league each season, linked to the last by
 * `previous_league_id`. Its playoff games are known from its winners
 * bracket: a game deciding first place (p 1) or only advancing (no p) is
 * the playoffs; one for a lower place (p 3, p 5), the losers' side, or a
 * week's pairing outside the bracket is consolation. A round played over
 * consecutive weeks is one game, its scores summed. Pure.
 */

import type { HistoryGame, HistorySeason } from '../history'
import type {
  SleeperBracketGame,
  SleeperLeague,
  SleeperMatchup,
  SleeperRoster,
  SleeperUser,
} from './client'

const round = (n: number) => Math.round(n * 100) / 100

export function readSleeperSeason(input: {
  league: SleeperLeague
  rosters: ReadonlyArray<SleeperRoster>
  users: ReadonlyArray<SleeperUser>
  /** Each scored week's matchups. */
  weeks: ReadonlyArray<{
    week: number
    matchups: ReadonlyArray<SleeperMatchup>
  }>
  winners: ReadonlyArray<SleeperBracketGame>
}): HistorySeason | null {
  const { league, rosters, users, weeks, winners } = input
  const season = Number(league.season)
  if (rosters.length === 0 || !Number.isFinite(season)) return null
  const complete = league.status === 'complete'
  const playoffStart = league.settings?.playoff_week_start || Infinity

  const managers: Record<string, string> = {}
  for (const u of users) {
    managers[u.user_id] = u.display_name || u.username || 'Manager'
  }
  const pairKey = (a: number, b: number) =>
    `${Math.min(a, b)}-${Math.max(a, b)}`
  const bracketGame = new Map<string, SleeperBracketGame>()
  const inBracket = new Set<number>()
  // Sleeper seeds its bracket as the season goes: it's only who made the
  // playoffs once they've begun.
  const begun = complete || weeks.some((w) => w.week >= playoffStart)
  for (const g of begun ? winners : []) {
    if (typeof g.t1 === 'number') inBracket.add(g.t1)
    if (typeof g.t2 === 'number') inBracket.add(g.t2)
    if (typeof g.t1 === 'number' && typeof g.t2 === 'number') {
      bracketGame.set(pairKey(g.t1, g.t2), g)
    }
  }

  const games: Array<HistoryGame> = []
  // A bracket game over more than one week: its weeks summed, by game.
  const merged = new Map<number, { game: HistoryGame; through: number }>()
  for (const { week, matchups } of [...weeks].sort((a, b) => a.week - b.week)) {
    const byMatchup = new Map<number, Array<SleeperMatchup>>()
    for (const m of matchups) {
      if (m.matchup_id === null) continue
      byMatchup.set(m.matchup_id, [...(byMatchup.get(m.matchup_id) ?? []), m])
    }
    for (const pair of byMatchup.values()) {
      if (pair.length !== 2) continue
      const [h, a] = pair
      const score = (m: SleeperMatchup) =>
        round(m.custom_points ?? m.points ?? 0)
      // Both at zero: not played yet.
      if (score(h) === 0 && score(a) === 0) continue
      const home = { teamId: h.roster_id, score: score(h) }
      const away = { teamId: a.roster_id, score: score(a) }
      const winnerOf = (x: typeof home, y: typeof home) =>
        x.score === y.score ? null : x.score > y.score ? x.teamId : y.teamId
      if (week < playoffStart) {
        games.push({
          period: week,
          bracket: 'regular',
          home,
          away,
          winner: winnerOf(home, away),
        })
        continue
      }
      const b = bracketGame.get(pairKey(home.teamId, away.teamId))
      const kept = b ? merged.get(b.m) : undefined
      // The bracket's pair meeting again, not in the week straight after:
      // not its game.
      if (!b || (kept && kept.through !== week - 1)) {
        games.push({
          period: week,
          bracket: 'consolation',
          home,
          away,
          winner: winnerOf(home, away),
        })
        continue
      }
      if (kept) {
        const { game } = kept
        const add = (s: typeof home) =>
          game.home.teamId === s.teamId ? game.home : game.away
        add(home).score = round(add(home).score + home.score)
        add(away).score = round(add(away).score + away.score)
        game.winner = b.w ?? winnerOf(game.home, game.away)
        kept.through = week
        continue
      }
      const game: HistoryGame = {
        period: week,
        bracket: b.p == null || b.p === 1 ? 'playoff' : 'consolation',
        home,
        away,
        winner: b.w ?? winnerOf(home, away),
      }
      merged.set(b.m, { game, through: week })
      games.push(game)
    }
  }

  const final = winners.find((g) => g.p === 1)
  const place = new Map<number, number>()
  if (complete) {
    for (const g of winners) {
      if (g.p == null || g.w == null || g.l == null) continue
      place.set(g.w, g.p)
      place.set(g.l, g.p + 1)
    }
  }
  const teamName = (r: SleeperRoster) => {
    const owner = users.find((u) => u.user_id === r.owner_id)
    return (
      owner?.metadata?.team_name || owner?.display_name || `Team ${r.roster_id}`
    )
  }
  const previous = league.previous_league_id
  return {
    season,
    ref: league.league_id,
    name: league.name?.trim() || `League ${league.league_id}`,
    points: true,
    complete,
    teams: rosters.map((r) => ({
      teamId: r.roster_id,
      name: teamName(r),
      managers: [
        ...new Set(
          [r.owner_id, ...(r.co_owners ?? [])].filter(
            (id): id is string => !!id,
          ),
        ),
      ],
      place: place.get(r.roster_id) ?? null,
      playoffs: inBracket.has(r.roster_id),
    })),
    managers,
    games,
    champion: complete ? (final?.w ?? null) : null,
    runnerUp: complete ? (final?.l ?? null) : null,
    earlier:
      previous && previous !== '0' ? [{ season: null, ref: previous }] : [],
  }
}
