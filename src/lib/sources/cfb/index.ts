/**
 * College football Source adapter: ESPN's site and core APIs, the same
 * shapes as the NFL's. Only part of FBS is covered (CONTEXT.md, "League"):
 * games involving a team from a COVERED_CONFERENCES conference or a
 * COVERED_TEAMS independent, whoever the opponent is.
 */

import { parseGame, parseRoster, parseScoreboard } from '../nfl/parse'
import type {
  NflCorePlays,
  NflRoster,
  NflScoreboard,
  NflSummary,
  NflTeams,
} from '../nfl/feed'
import type { SourceAdapter } from '@/lib/model/types'

const SITE =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football'
const CORE =
  'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football'

/** ESPN group ids: ACC, Big 12, Big Ten, SEC. */
export const COVERED_CONFERENCES: ReadonlySet<string> = new Set([
  '1',
  '4',
  '5',
  '8',
])
/** Independents covered on their own: Notre Dame. */
export const COVERED_TEAMS: ReadonlySet<string> = new Set(['87'])
/** ESPN's FBS group, for the scoreboard. */
const FBS = '80'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`)
  return (await res.json()) as T
}

/** Does this game involve a covered team? */
export function isCovered(
  event: NonNullable<NflScoreboard['events']>[number],
): boolean {
  return (event.competitions?.[0]?.competitors ?? []).some(
    (c) =>
      COVERED_TEAMS.has(c.team.id) ||
      (c.team.conferenceId !== undefined &&
        COVERED_CONFERENCES.has(c.team.conferenceId)),
  )
}

interface CoreTeamList {
  items?: Array<{ $ref?: string }>
}

/** The covered teams' ESPN ids, from the season's conference lists. */
async function coveredTeamIds(): Promise<Array<string>> {
  // A season runs August to January: bowls and the playoff belong to the
  // year it started.
  const now = new Date()
  const season = now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0)
  const lists = await Promise.all(
    [...COVERED_CONFERENCES].map((group) =>
      getJson<CoreTeamList>(
        `${CORE}/seasons/${season}/types/2/groups/${group}/teams?limit=50`,
      ),
    ),
  )
  const ids = lists.flatMap((l) =>
    (l.items ?? []).flatMap((i) => {
      const id = i.$ref?.match(/\/teams\/(\d+)/)?.[1]
      return id ? [id] : []
    }),
  )
  return [...new Set([...ids, ...COVERED_TEAMS])]
}

export const cfbAdapter: SourceAdapter = {
  league: 'cfb',
  source: 'espn',
  async schedule(sportsDay) {
    const scoreboard = await getJson<NflScoreboard>(
      `${SITE}/scoreboard?groups=${FBS}&limit=300&dates=${sportsDay.replaceAll('-', '')}`,
    )
    return parseScoreboard(
      { ...scoreboard, events: (scoreboard.events ?? []).filter(isCovered) },
      'cfb',
    )
  },
  async snapshot(sourceGameId) {
    const id = encodeURIComponent(sourceGameId)
    const [summary, plays] = await Promise.all([
      getJson<NflSummary>(`${SITE}/summary?event=${id}`),
      getJson<NflCorePlays>(
        `${CORE}/events/${id}/competitions/${id}/plays?limit=500`,
      ),
    ])
    return parseGame(summary, plays, 'cfb')
  },
  async roster() {
    const [ids, all] = await Promise.all([
      coveredTeamIds(),
      getJson<NflTeams>(`${SITE}/teams?limit=1000`),
    ])
    const covered = new Set(ids)
    const league = all.sports?.[0]?.leagues?.[0]
    const teams: NflTeams = {
      sports: [
        {
          leagues: [
            {
              teams: (league?.teams ?? []).filter((t) =>
                covered.has(t.team.id),
              ),
            },
          ],
        },
      ],
    }
    const rosters = await Promise.all(
      ids.map(async (teamId) => ({
        teamId,
        roster: await getJson<NflRoster>(`${SITE}/teams/${teamId}/roster`),
      })),
    )
    return parseRoster(teams, rosters, 'cfb')
  },
}
