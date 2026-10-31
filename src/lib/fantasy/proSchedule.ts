/**
 * Each pro Team's next Game, read from ESPN Fantasy's public pro schedule
 * (`proTeamSchedules_wl`), keyed by ESPN's pro team id: what Available
 * players shows beside each Player. Pure.
 */

/** A Player's Team's next Game, as a row shows it. */
export interface NextGame {
  /** When it starts, epoch ms. */
  startsAt: number
  /** The other Team's abbreviation ("LAL"), when ESPN names it. */
  opponent: string | null
  /** At home ("vs LAL") rather than away ("@ LAL"). */
  home: boolean
  /** ESPN hasn't set the start time yet: show the day only. */
  tbd: boolean
}

/** One of ESPN's pro Games. */
export interface WireProGame {
  id?: number
  date?: number
  homeProTeamId?: number
  awayProTeamId?: number
  startTimeTBD?: boolean
}

/** One of ESPN's pro Teams, with its season's Games by scoring period. */
export interface WireProTeam {
  id?: number
  abbrev?: string
  proGamesByScoringPeriod?: Record<string, Array<WireProGame>>
}

export interface WireProSchedule {
  settings?: { proTeams?: Array<WireProTeam> }
}

/**
 * A Game that started this long ago still counts as the next one: it may
 * still be on.
 */
export const IN_PROGRESS_MS = 4 * 60 * 60_000

/** Each pro Team's next Game from `now`, by ESPN pro team id. */
export function nextGames(
  wire: WireProSchedule,
  now: number,
): Map<number, NextGame> {
  const teams = wire.settings?.proTeams ?? []
  const abbrevs = new Map(
    teams.flatMap((t) =>
      t.id === undefined || !t.abbrev ? [] : [[t.id, t.abbrev] as const],
    ),
  )
  const out = new Map<number, NextGame>()
  for (const t of teams) {
    if (t.id === undefined || t.id === 0) continue
    let best: WireProGame | null = null
    for (const games of Object.values(t.proGamesByScoringPeriod ?? {}))
      for (const g of games) {
        if (g.date === undefined || g.date < now - IN_PROGRESS_MS) continue
        if (!best || g.date < best.date!) best = g
      }
    if (!best) continue
    const home = best.homeProTeamId === t.id
    const other = home ? best.awayProTeamId : best.homeProTeamId
    out.set(t.id, {
      startsAt: best.date!,
      opponent: (other !== undefined && abbrevs.get(other)) || null,
      home,
      tbd: best.startTimeTBD === true,
    })
  }
  return out
}
