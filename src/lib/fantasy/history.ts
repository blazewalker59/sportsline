/**
 * A Fantasy league's History (CONTEXT.md, "League history"): each season
 * the provider keeps, as one shape for ESPN and Sleeper, and what they add
 * up to: every season's champion, each manager's all-time record, the
 * Viewer's head-to-head against each manager, and the league's scoring
 * records. Seasons are read once they're complete and kept
 * (fantasy/historyRead.ts); this module is pure.
 *
 * Managers, not teams, carry history: a team id is reused when a manager
 * leaves, and a team's name changes most seasons. A team's co-managers
 * each share its results. Consolation games count toward nothing.
 */

import { teamName } from './matchup'
import type { WireLeague } from './matchup'

/** Where a game sits in its season. */
export type Bracket = 'regular' | 'playoff' | 'consolation'

export interface HistoryTeam {
  teamId: number
  name: string
  /** Its managers' ids (ESPN member SWIDs, Sleeper user ids), co-managers too. */
  managers: Array<string>
  /** Final place, when the provider decides it. */
  place: number | null
  /** In the playoff bracket (a bye counts). */
  playoffs: boolean
}

export interface HistoryGame {
  /** Matchup period (ESPN) or week (Sleeper); a two-week round's first. */
  period: number
  bracket: Bracket
  home: { teamId: number; score: number }
  away: { teamId: number; score: number }
  /** The winning team; null for a tie. */
  winner: number | null
}

export interface HistorySeason {
  season: number
  /** The provider's id for the season's league (Sleeper: one per season). */
  ref: string
  name: string
  /** A points league; otherwise a game's score is categories won. */
  points: boolean
  /** Over: its champion is decided and nothing in it changes. */
  complete: boolean
  teams: Array<HistoryTeam>
  /** Each manager's name, by id. */
  managers: Record<string, string>
  /** Decided games only: byes and games not yet played are left out. */
  games: Array<HistoryGame>
  champion: number | null
  runnerUp: number | null
  /**
   * The seasons before it the provider says it has: ESPN lists them all;
   * Sleeper links only the one before, by its league id (season unknown
   * until it's read).
   */
  earlier: Array<{ season: number | null; ref: string }>
}

const round = (n: number) => Math.round(n * 100) / 100

const swid = (id: string) => id.trim().toUpperCase()

/**
 * One ESPN season as History keeps it, from `seasonLeague`'s views. A
 * past season is complete; the current one once ESPN's latest scoring
 * period passes its last. The champion is the winner of the last
 * winners-bracket game, else ESPN's first place; none while the season
 * is on.
 */
export function readEspnSeason(
  wire: WireLeague,
  input: { season: number; leagueId: string; past: boolean },
): HistorySeason | null {
  const teams = wire.teams ?? []
  if (teams.length === 0) return null
  const { season, leagueId, past } = input
  const settings = wire.settings
  // H2H_CATEGORY, H2H_MOST_CATEGORIES, ROTO…
  const points = !/CATEGOR|ROTO/.test(
    settings?.scoringSettings?.scoringType ?? '',
  )
  // ESPN places some leagues' teams before the season is over, so the
  // season's own clock decides: past its last scoring period, it's done.
  const { latestScoringPeriod: latest, finalScoringPeriod: lastPeriod } =
    wire.status ?? {}
  const complete =
    past ||
    (latest !== undefined && lastPeriod !== undefined && latest > lastPeriod)

  const managers: Record<string, string> = {}
  for (const m of wire.members ?? []) {
    const full = [m.firstName, m.lastName].filter(Boolean).join(' ').trim()
    managers[swid(m.id)] = full || m.displayName || 'Manager'
  }

  const schedule = wire.schedule ?? []
  const tiered = schedule.some((e) => e.playoffTierType)
  const regularPeriods = settings?.scheduleSettings?.matchupPeriodCount ?? null
  const playoffCount = settings?.scheduleSettings?.playoffTeamCount ?? null
  const seed = new Map(teams.map((t) => [t.id, t.playoffSeed ?? 0]))
  const seeded = (teamId: number | undefined) =>
    teamId !== undefined &&
    playoffCount !== null &&
    (seed.get(teamId) ?? 0) > 0 &&
    (seed.get(teamId) ?? 0) <= playoffCount
  const bracketOf = (e: (typeof schedule)[number]): Bracket => {
    if (tiered) {
      if (!e.playoffTierType || e.playoffTierType === 'NONE') return 'regular'
      return e.playoffTierType === 'WINNERS_BRACKET' ? 'playoff' : 'consolation'
    }
    // Without tiers: past the regular season, a game between two playoff
    // seeds is the bracket's.
    const period = e.matchupPeriodId ?? 0
    if (regularPeriods === null || period <= regularPeriods) return 'regular'
    return seeded(e.home?.teamId) && seeded(e.away?.teamId)
      ? 'playoff'
      : 'consolation'
  }
  const scoreOf = (side: NonNullable<(typeof schedule)[number]['home']>) =>
    round(points ? (side.totalPoints ?? 0) : (side.cumulativeScore?.wins ?? 0))

  const games: Array<HistoryGame> = []
  const inBracket = new Set<number>()
  for (const e of schedule) {
    const bracket = bracketOf(e)
    if (bracket === 'playoff') {
      for (const id of [e.home?.teamId, e.away?.teamId]) {
        if (id !== undefined) inBracket.add(id)
      }
    }
    const home = e.home?.teamId
    const away = e.away?.teamId
    if (home === undefined || away === undefined || !e.home || !e.away) continue
    if (e.winner !== 'HOME' && e.winner !== 'AWAY' && e.winner !== 'TIE') {
      continue
    }
    games.push({
      period: e.matchupPeriodId ?? 0,
      bracket,
      home: { teamId: home, score: scoreOf(e.home) },
      away: { teamId: away, score: scoreOf(e.away) },
      winner: e.winner === 'HOME' ? home : e.winner === 'AWAY' ? away : null,
    })
  }

  const placeOf = (t: (typeof teams)[number]) =>
    complete && (t.rankCalculatedFinal ?? 0) > 0 ? t.rankCalculatedFinal! : null
  let champion: number | null = null
  let runnerUp: number | null = null
  if (complete) {
    const finals = games.filter((g) => g.bracket === 'playoff')
    const last = Math.max(...finals.map((g) => g.period))
    const final = finals.filter((g) => g.period === last)
    if (final.length === 1 && final[0].winner !== null) {
      champion = final[0].winner
      runnerUp =
        final[0].winner === final[0].home.teamId
          ? final[0].away.teamId
          : final[0].home.teamId
    } else {
      champion = teams.find((t) => placeOf(t) === 1)?.id ?? null
      runnerUp = teams.find((t) => placeOf(t) === 2)?.id ?? null
    }
  }

  return {
    season,
    ref: leagueId,
    name: settings?.name ?? `League ${leagueId}`,
    points,
    complete,
    teams: teams.map((t) => ({
      teamId: t.id,
      name: teamName(t),
      managers: [
        ...new Set(
          (t.owners?.length ? t.owners : t.primaryOwner ? [t.primaryOwner] : [])
            .filter(Boolean)
            .map(swid),
        ),
      ],
      place: placeOf(t),
      playoffs: tiered ? inBracket.has(t.id) : complete && seeded(t.id),
    })),
    managers,
    games,
    champion,
    runnerUp,
    earlier: [...new Set(wire.status?.previousSeasons ?? [])]
      .filter((s) => s < season)
      .sort((a, b) => b - a)
      .map((s) => ({ season: s, ref: leagueId })),
  }
}

// ─── What the seasons add up to ────────────────────────────────────────────

export interface ChampionRow {
  season: number
  /** Still being played: no champion yet. */
  complete: boolean
  champion: { team: string; manager: string } | null
  runnerUp: { team: string; manager: string } | null
  /** The Viewer won it. */
  mine: boolean
}

/** One manager across every season they played in. */
export interface ManagerRow {
  id: string
  name: string
  seasons: number
  /** Regular season. */
  wins: number
  losses: number
  ties: number
  playoffWins: number
  playoffLosses: number
  /** Seasons in the playoff bracket. */
  playoffs: number
  titles: number
  /** Lost in the final. */
  finals: number
  mine: boolean
}

/** The Viewer against one other manager, every season they met. */
export interface RivalRow {
  id: string
  name: string
  wins: number
  losses: number
  ties: number
  playoffWins: number
  playoffLosses: number
  last: {
    season: number
    period: number
    bracket: Bracket
    points: boolean
    mine: number
    theirs: number
  }
}

/** A score the league remembers (points seasons only). */
export interface ScoreRecord {
  season: number
  period: number
  bracket: Bracket
  team: string
  manager: string
  score: number
  opponent: string
  opponentManager: string
  opponentScore: number
}

export interface LeagueHistory {
  /** Seasons counted, newest first. */
  seasons: Array<number>
  champions: Array<ChampionRow>
  managers: Array<ManagerRow>
  /** The Viewer's head-to-head; empty when they aren't known. */
  rivals: Array<RivalRow>
  /** Null when no season was a points league. */
  records: {
    highest: ScoreRecord
    lowest: ScoreRecord
    blowout: ScoreRecord
    closest: ScoreRecord
  } | null
  /** Seasons the provider listed but wouldn't answer for. */
  missing: Array<number>
}

const pct = (w: number, l: number, t: number) =>
  w + l + t === 0 ? 0 : (w + t / 2) / (w + l + t)

/**
 * What the seasons add up to. `mine` is the Viewer's manager ids. Names
 * are each manager's latest.
 */
export function summarizeHistory(
  input: ReadonlyArray<HistorySeason>,
  mine: ReadonlyArray<string>,
  missing: ReadonlyArray<number> = [],
): LeagueHistory {
  const seasons = [...input].sort((a, b) => b.season - a.season)
  const me = new Set(mine)
  const names = new Map<string, string>()
  for (const s of seasons) {
    for (const [id, name] of Object.entries(s.managers)) {
      if (!names.has(id)) names.set(id, name)
    }
  }
  const nameOf = (id: string) => names.get(id) ?? 'Manager'
  const managersOf = (team: HistoryTeam | undefined) =>
    team?.managers.length
      ? team.managers.map(nameOf).join(' & ')
      : (team?.name ?? 'Unknown')

  const rows = new Map<string, ManagerRow>()
  const rowOf = (id: string) => {
    let row = rows.get(id)
    if (!row) {
      row = {
        id,
        name: nameOf(id),
        seasons: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        playoffWins: 0,
        playoffLosses: 0,
        playoffs: 0,
        titles: 0,
        finals: 0,
        mine: me.has(id),
      }
      rows.set(id, row)
    }
    return row
  }
  const rivals = new Map<string, RivalRow>()
  let records: LeagueHistory['records'] = null
  const champions: Array<ChampionRow> = []

  for (const s of seasons) {
    const byId = new Map(s.teams.map((t) => [t.teamId, t]))
    const team = (id: number | null) => (id === null ? undefined : byId.get(id))
    const side = (id: number | null) => {
      const t = team(id)
      return t ? { team: t.name, manager: managersOf(t) } : null
    }
    champions.push({
      season: s.season,
      complete: s.complete,
      champion: side(s.champion),
      runnerUp: side(s.runnerUp),
      mine: team(s.champion)?.managers.some((m) => me.has(m)) ?? false,
    })
    for (const t of s.teams) {
      for (const id of t.managers) {
        const row = rowOf(id)
        row.seasons += 1
        if (t.playoffs) row.playoffs += 1
        if (s.champion === t.teamId) row.titles += 1
        if (s.runnerUp === t.teamId) row.finals += 1
      }
    }
    for (const g of s.games) {
      if (g.bracket === 'consolation') continue
      const playoff = g.bracket === 'playoff'
      const home = team(g.home.teamId)
      const away = team(g.away.teamId)
      for (const [t, us, them, other] of [
        [home, g.home, g.away, away],
        [away, g.away, g.home, home],
      ] as const) {
        const result =
          g.winner === null ? 'T' : g.winner === us.teamId ? 'W' : 'L'
        for (const id of t?.managers ?? []) {
          const row = rowOf(id)
          if (playoff) {
            if (result === 'W') row.playoffWins += 1
            if (result === 'L') row.playoffLosses += 1
          } else if (result === 'W') row.wins += 1
          else if (result === 'L') row.losses += 1
          else row.ties += 1
        }
        if (!t?.managers.some((m) => me.has(m))) continue
        for (const id of other?.managers ?? []) {
          if (me.has(id)) continue
          let rival = rivals.get(id)
          if (!rival) {
            rival = {
              id,
              name: nameOf(id),
              wins: 0,
              losses: 0,
              ties: 0,
              playoffWins: 0,
              playoffLosses: 0,
              last: {
                season: s.season,
                period: g.period,
                bracket: g.bracket,
                points: s.points,
                mine: us.score,
                theirs: them.score,
              },
            }
            rivals.set(id, rival)
          }
          if (
            s.season > rival.last.season ||
            (s.season === rival.last.season && g.period > rival.last.period)
          ) {
            rival.last = {
              season: s.season,
              period: g.period,
              bracket: g.bracket,
              points: s.points,
              mine: us.score,
              theirs: them.score,
            }
          }
          if (result === 'W') rival[playoff ? 'playoffWins' : 'wins'] += 1
          else if (result === 'L') {
            rival[playoff ? 'playoffLosses' : 'losses'] += 1
          } else rival.ties += 1
        }
      }
      if (!s.points) continue
      const mark = (
        us: HistoryGame['home'],
        them: HistoryGame['home'],
      ): ScoreRecord => ({
        season: s.season,
        period: g.period,
        bracket: g.bracket,
        team: team(us.teamId)?.name ?? 'Unknown',
        manager: managersOf(team(us.teamId)),
        score: us.score,
        opponent: team(them.teamId)?.name ?? 'Unknown',
        opponentManager: managersOf(team(them.teamId)),
        opponentScore: them.score,
      })
      const [hi, lo] =
        g.home.score >= g.away.score ? [g.home, g.away] : [g.away, g.home]
      const margin = round(hi.score - lo.score)
      if (!records) {
        records = {
          highest: mark(hi, lo),
          lowest: mark(lo, hi),
          blowout: mark(hi, lo),
          closest: mark(hi, lo),
        }
        continue
      }
      if (hi.score > records.highest.score) records.highest = mark(hi, lo)
      if (lo.score < records.lowest.score) records.lowest = mark(lo, hi)
      const gap = (r: ScoreRecord) => round(r.score - r.opponentScore)
      if (margin > gap(records.blowout)) records.blowout = mark(hi, lo)
      // A tie isn't close, it's even: the closest decided game.
      if (
        margin > 0 &&
        (gap(records.closest) === 0 || margin < gap(records.closest))
      ) {
        records.closest = mark(hi, lo)
      }
    }
  }

  const games = (r: { wins: number; losses: number; ties: number }) =>
    r.wins + r.losses + r.ties
  return {
    seasons: seasons.map((s) => s.season),
    champions,
    managers: [...rows.values()].sort(
      (a, b) =>
        b.titles - a.titles ||
        pct(b.wins, b.losses, b.ties) - pct(a.wins, a.losses, a.ties) ||
        b.wins - a.wins ||
        a.name.localeCompare(b.name),
    ),
    rivals: [...rivals.values()].sort(
      (a, b) =>
        games(b) +
          b.playoffWins +
          b.playoffLosses -
          (games(a) + a.playoffWins + a.playoffLosses) ||
        a.name.localeCompare(b.name),
    ),
    records,
    missing: [...missing].sort((a, b) => b - a),
  }
}
