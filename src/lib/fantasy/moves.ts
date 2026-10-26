/**
 * Roster moves a Viewer makes in an ESPN league (docs/adr/0010): adding
 * a free agent, claiming a Player on waivers, dropping one. What's sent,
 * how ESPN's answer reads, the check made just before sending, and how
 * a move with no answer (or a claim waiting on waivers) settles from
 * the league's rosters later. Pure.
 */

import type { WireLeague } from './matchup'

export type MoveKind = 'add' | 'claim' | 'drop'

/**
 * - sending: on its way (a move stuck here, its Worker gone, is unknown)
 * - done: ESPN made it (a claim: won)
 * - pending: a claim ESPN took, waiting for the league's waivers to run
 * - lost: a claim another team won
 * - refused: ESPN said no, so nothing changed
 * - unknown: sent, but no answer came back; it may have gone through
 */
export type MoveStatus =
  'sending' | 'done' | 'pending' | 'lost' | 'refused' | 'unknown'

export interface MovePlayer {
  espnId: number
  name: string
}

export interface FantasyMove {
  id: string
  kind: MoveKind
  add: MovePlayer | null
  drop: MovePlayer | null
  /** A claim's bid, where the league bids. */
  bid: number | null
  status: MoveStatus
  /** ESPN's reason, or why it settled as it did. */
  reason: string | null
  createdAt: string
  updatedAt: string
}

/** A Viewer's moves in an hour, at most. */
export const MOVES_PER_HOUR = 10

/** A move still sending after this lost its Worker: it's unknown. */
export const STUCK_MS = 2 * 60_000

/** An add or drop not on ESPN's rosters after this didn't go through. */
export const NOT_FOUND_MS = 15 * 60_000

/** What ESPN's transactions endpoint takes. */
export interface WireMove {
  isLeagueManager: false
  teamId: number
  type: 'FREEAGENT' | 'WAIVER'
  memberId: string
  scoringPeriodId: number
  executionType: 'EXECUTE'
  bidAmount: number
  items: Array<
    | { playerId: number; type: 'ADD'; toTeamId: number }
    | { playerId: number; type: 'DROP'; fromTeamId: number }
  >
}

export function moveBody(input: {
  kind: MoveKind
  teamId: number
  /** The Viewer's SWID, braced (their ESPN member id). */
  memberId: string
  scoringPeriod: number
  add: number | null
  drop: number | null
  bid: number | null
}): WireMove {
  const { teamId } = input
  return {
    isLeagueManager: false,
    teamId,
    type: input.kind === 'claim' ? 'WAIVER' : 'FREEAGENT',
    memberId: input.memberId,
    scoringPeriodId: input.scoringPeriod,
    executionType: 'EXECUTE',
    bidAmount: input.kind === 'claim' ? (input.bid ?? 0) : 0,
    items: [
      ...(input.add === null
        ? []
        : [{ playerId: input.add, type: 'ADD' as const, toTeamId: teamId }]),
      ...(input.drop === null
        ? []
        : [
            {
              playerId: input.drop,
              type: 'DROP' as const,
              fromTeamId: teamId,
            },
          ]),
    ],
  }
}

/** ESPN's own words for a refusal, when it gives any. */
export function espnReason(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as {
    details?: Array<{ message?: string; shortMessage?: string }>
    messages?: Array<unknown>
    message?: unknown
  }
  const detail = b.details?.find((d) => d.message ?? d.shortMessage)
  const text =
    detail?.message ??
    detail?.shortMessage ??
    b.messages?.find((m) => typeof m === 'string') ??
    b.message
  return typeof text === 'string' && text.trim() ? text.trim() : null
}

/**
 * A move's outcome from ESPN's answer: a status of null means no answer
 * came back at all.
 */
export function readMoveReply(
  kind: MoveKind,
  status: number | null,
  body: unknown,
): { status: MoveStatus; reason: string | null } {
  if (status !== null && status >= 200 && status < 300) {
    const said =
      typeof body === 'object' && body !== null && 'status' in body
        ? String((body as { status: unknown }).status)
        : null
    return {
      status: kind === 'claim' || said === 'PENDING' ? 'pending' : 'done',
      reason: null,
    }
  }
  // ESPN answered no: nothing was made. A timeout or its own failure
  // (5xx) might have made it all the same.
  if (status !== null && status >= 400 && status < 500 && status !== 408)
    return {
      status: 'refused',
      reason: espnReason(body) ?? `ESPN refused it (${status}).`,
    }
  return { status: 'unknown', reason: null }
}

/** Every rostered Player in the league, with the team that has them. */
export function rosteredBy(league: WireLeague): Map<number, number> {
  const out = new Map<number, number>()
  for (const t of league.teams ?? [])
    for (const e of t.roster?.entries ?? []) {
      const id = e.playerPoolEntry?.player?.id ?? e.playerId
      if (id !== undefined) out.set(id, t.id)
    }
  return out
}

/**
 * The check just before sending, against rosters read now: why the move
 * can't go, or null when it can. ESPN checks its own rules (roster
 * limits, locked Players) when it's sent.
 */
export function checkMove(input: {
  kind: MoveKind
  add: MovePlayer | null
  drop: MovePlayer | null
  teamId: number
  rosters: ReadonlyMap<number, number>
}): string | null {
  const { kind, add, drop, teamId, rosters } = input
  if (kind === 'drop' ? !drop : !add) return 'Pick a player first.'
  if (add) {
    const has = rosters.get(add.espnId)
    if (has === teamId) return `${add.name} is already on your team.`
    if (has !== undefined) return `${add.name} is on another team now.`
  }
  if (drop && rosters.get(drop.espnId) !== teamId)
    return `${drop.name} isn’t on your team any more.`
  return null
}

/**
 * A move's outcome from the league's rosters, once it's been waiting
 * (unknown, a pending claim, or stuck sending); null while it's still
 * waiting.
 */
export function settleMove(
  move: Pick<FantasyMove, 'kind' | 'add' | 'drop' | 'status' | 'updatedAt'>,
  rosters: ReadonlyMap<number, number>,
  teamId: number,
  now: Date,
): { status: MoveStatus; reason: string | null } | null {
  const age = now.getTime() - Date.parse(move.updatedAt)
  const status =
    move.status === 'sending' && age > STUCK_MS ? 'unknown' : move.status
  if (status !== 'unknown' && status !== 'pending') return null
  const added = move.add ? rosters.get(move.add.espnId) : undefined
  const dropped = move.drop ? rosters.get(move.drop.espnId) !== teamId : false
  if (move.add ? added === teamId : dropped)
    return { status: 'done', reason: null }
  if (move.kind === 'claim') {
    if (added !== undefined)
      return { status: 'lost', reason: 'Another team won the claim.' }
    // A claim may still be waiting for waivers, whether ESPN answered or not.
    return status === 'pending'
      ? null
      : {
          status: 'pending',
          reason:
            'No answer from ESPN: if it went through, it waits for waivers.',
        }
  }
  if (age < NOT_FOUND_MS)
    return status === move.status ? null : { status, reason: null }
  return {
    status: 'refused',
    reason:
      added !== undefined
        ? 'Another team got them first.'
        : 'ESPN has no record of it.',
  }
}

/** A budget league's bidding: what the Viewer's team has left to bid. */
export interface MoveBudget {
  left: number
  total: number
  minimum: number
}

export function budgetOf(
  league: WireLeague,
  teamId: number,
): MoveBudget | null {
  const a = league.settings?.acquisitionSettings
  if (!a?.isUsingAcquisitionBudget) return null
  const total = a.acquisitionBudget ?? 0
  const spent =
    league.teams?.find((t) => t.id === teamId)?.transactionCounter
      ?.acquisitionBudgetSpent ?? 0
  return {
    left: Math.max(0, total - spent),
    total,
    minimum: a.minimumBid ?? 0,
  }
}

/** A move in words: "Claim Bub Carrington ($4), drop Jordan Clarkson". */
export function moveSummary(
  move: Pick<FantasyMove, 'kind' | 'add' | 'drop' | 'bid'>,
): string {
  const { kind, add, drop, bid } = move
  if (kind === 'drop' || !add) return drop ? `Drop ${drop.name}` : 'Drop'
  const verb = kind === 'claim' ? 'Claim' : 'Add'
  const amount = kind === 'claim' && bid !== null ? ` ($${bid})` : ''
  return `${verb} ${add.name}${amount}${drop ? `, drop ${drop.name}` : ''}`
}

/** How a move's outcome reads beside it. */
export const MOVE_STATUS: Record<MoveStatus, string> = {
  sending: 'Sending',
  done: 'Done',
  pending: 'Waiting for waivers',
  lost: 'Lost',
  refused: 'Refused',
  unknown: 'Checking',
}
