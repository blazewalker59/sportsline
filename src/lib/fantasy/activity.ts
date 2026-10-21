/**
 * A Fantasy league's Activity (CONTEXT.md, "League activity"): its recent
 * adds, drops, waiver claims and trades, newest first, read from its
 * provider when the Viewer looks and never stored. ESPN's come from its
 * league communication feed (one topic, one entry: an add bundled with a
 * drop reads as one move); Sleeper's from its transactions (sleeper/read.ts).
 * Pure.
 */

import type { LineupPlayer } from './matchup'

/** A Player in a move, enough for their name, Team and headshot. */
export type ActivityPlayer = Pick<
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
>

export type ActivityKind = 'add' | 'drop' | 'add_drop' | 'waiver' | 'trade'

export interface ActivityItem {
  action: 'add' | 'drop'
  player: ActivityPlayer
  /** The team it left (a drop, a trade). */
  fromTeamId: number | null
  /** The team it joined (an add, a trade). */
  toTeamId: number | null
}

export interface ActivityEntry {
  id: string
  kind: ActivityKind
  /** When it went through. */
  at: string
  /** The team that moved, first; both (or all) sides of a trade. */
  teamIds: Array<number>
  items: Array<ActivityItem>
  /** A waiver claim's winning bid (FAAB), when the league bids. */
  bid: number | null
}

export interface ActivityTeam {
  teamId: number
  name: string
  abbrev: string
}

export interface LeagueActivity {
  teams: Array<ActivityTeam>
  entries: Array<ActivityEntry>
}

/** Every entry, as many as the feed's asked for. */
export const ACTIVITY_LIMIT = 50

/** Whether a move added Players, dropped them, or both. */
export function kindOf(
  items: ReadonlyArray<ActivityItem>,
  waiver: boolean,
): ActivityKind {
  if (waiver) return 'waiver'
  const adds = items.some((i) => i.action === 'add')
  const drops = items.some((i) => i.action === 'drop')
  return adds && drops ? 'add_drop' : drops ? 'drop' : 'add'
}

// ─── ESPN ──────────────────────────────────────────────────────────────────

/** ESPN's communication feed (kona_league_communication), loosely. */
export interface WireTopic {
  id?: string | number
  date?: number
  messages?: Array<{
    messageTypeId?: number
    targetId?: number
    to?: number
    from?: number
    for?: number
  }>
}

/** ESPN's message types: who was added, dropped or traded. */
const FA_ADDED = 178
const WAIVER_ADDED = 180
const DROPPED = new Set([179, 181, 239])
const TRADED = 244

/** The message types the feed is asked for. */
export const ESPN_ACTIVITY_TYPES = [
  FA_ADDED,
  WAIVER_ADDED,
  179,
  181,
  239,
  TRADED,
]

/** Every Player a feed names, to look them up in one read. */
export function espnActivityPlayerIds(
  topics: ReadonlyArray<WireTopic>,
): Array<number> {
  return [
    ...new Set(
      topics.flatMap((t) =>
        (t.messages ?? []).flatMap((m) =>
          typeof m.targetId === 'number' ? [m.targetId] : [],
        ),
      ),
    ),
  ]
}

/**
 * ESPN's feed as entries, newest first. A trade's messages say who sent
 * each Player where; an add's `from` on a waiver claim is the bid, and a
 * drop's team is `for` (type 239) or `to`.
 */
export function readEspnActivity(
  topics: ReadonlyArray<WireTopic>,
  playerOf: (espnId: number) => ActivityPlayer,
): Array<ActivityEntry> {
  const entries = topics.flatMap((topic, index): Array<ActivityEntry> => {
    const messages = topic.messages ?? []
    const id = String(topic.id ?? `${topic.date ?? 0}-${index}`)
    const at = new Date(topic.date ?? 0).toISOString()
    const traded = messages.filter((m) => m.messageTypeId === TRADED)
    if (traded.length > 0) {
      const items = traded.flatMap((m) =>
        m.targetId === undefined
          ? []
          : [
              {
                action: 'add' as const,
                player: playerOf(m.targetId),
                fromTeamId: m.from ?? null,
                toTeamId: m.to ?? null,
              },
            ],
      )
      const teamIds = [
        ...new Set(
          items.flatMap((i) =>
            [i.fromTeamId, i.toTeamId].filter((t): t is number => t !== null),
          ),
        ),
      ].sort((a, b) => a - b)
      return [{ id, kind: 'trade', at, teamIds, items, bid: null }]
    }
    const items: Array<ActivityItem> = []
    let team: number | undefined
    let bid: number | null = null
    for (const m of messages) {
      if (m.targetId === undefined) continue
      if (m.messageTypeId === FA_ADDED || m.messageTypeId === WAIVER_ADDED) {
        items.push({
          action: 'add',
          player: playerOf(m.targetId),
          fromTeamId: null,
          toTeamId: m.to ?? null,
        })
        team ??= m.to
        if (m.messageTypeId === WAIVER_ADDED) bid = m.from ?? 0
      } else if (DROPPED.has(m.messageTypeId ?? -1)) {
        const from = m.messageTypeId === 239 ? m.for : m.to
        items.push({
          action: 'drop',
          player: playerOf(m.targetId),
          fromTeamId: from ?? null,
          toTeamId: null,
        })
        team ??= from
      }
    }
    if (items.length === 0) return []
    return [
      {
        id,
        kind: kindOf(items, bid !== null),
        at,
        teamIds: team === undefined ? [] : [team],
        items,
        bid,
      },
    ]
  })
  return newestFirst(entries)
}

export function newestFirst(
  entries: ReadonlyArray<ActivityEntry>,
): Array<ActivityEntry> {
  return [...entries]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, ACTIVITY_LIMIT)
}
