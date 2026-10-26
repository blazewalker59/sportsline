/**
 * A Viewer's roster moves in an ESPN league (docs/adr/0010), made only
 * when they confirm one on the league's page: what the move sheet offers,
 * and sending a move once, with its outcome kept. A move with no answer,
 * or a claim waiting on waivers, settles at the league's next sync
 * (settleMoves in fantasy/sync.ts). Server only.
 */

import { and, desc, eq, gt } from 'drizzle-orm'
import { bracedSwid, leagueRosters, postMove } from './client'
import { myTeamId } from './matchup'
import {
  MOVES_PER_HOUR,
  STUCK_MS,
  budgetOf,
  checkMove,
  moveBody,
  readMoveReply,
  rosteredBy,
} from './moves'
import { loadSession } from './sync'
import type { ActivityPlayer } from './activity'
import type { FantasyMove, MoveBudget, MoveKind, MovePlayer } from './moves'
import type { CloudflareEnv, Database } from '@/lib/db'
import type { fantasyLeagues } from '@/lib/db/schema'
import { dbFromD1 } from '@/lib/db'
import { espnAccounts, fantasyMoves } from '@/lib/db/schema'
import { reportError } from '@/lib/ops/errors'
import { UserError } from '@/lib/userError'

type LeagueRow = typeof fantasyLeagues.$inferSelect
type Env = Pick<CloudflareEnv, 'DB' | 'ESPN_ENCRYPTION_KEY'>

/** One of the Viewer's Players, as the move sheet offers them to drop. */
export type RosterPlayer = ActivityPlayer & {
  slot: string
  starter: boolean
  injury: string | null
}

/** What a league's move sheet needs. */
export interface MoveOptions {
  /** The Viewer turned roster moves on for ESPN. */
  enabled: boolean
  /** Their team as last synced, starters first. */
  roster: Array<RosterPlayer>
  /** A budget league's bidding, read from ESPN now (null: no budget). */
  budget: MoveBudget | null
  /** Their latest moves here, newest first. */
  moves: Array<FantasyMove>
}

/** How many of a league's moves the Players tab lists. */
const MOVES_SHOWN = 8

function moveOf(r: typeof fantasyMoves.$inferSelect): FantasyMove {
  return {
    id: r.id,
    kind: r.kind,
    add: r.add ?? null,
    drop: r.drop ?? null,
    bid: r.bid,
    status: r.status,
    reason: r.reason,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

async function movesEnabled(db: Database, viewerId: string): Promise<boolean> {
  const account = await db
    .select({ movesEnabled: espnAccounts.movesEnabled })
    .from(espnAccounts)
    .where(eq(espnAccounts.viewerId, viewerId))
    .get()
  return account?.movesEnabled ?? false
}

/** The move sheet's options for one of the Viewer's ESPN leagues. */
export async function moveOptions(
  env: Env,
  viewerId: string,
  row: LeagueRow,
): Promise<MoveOptions | null> {
  if (row.viewerId !== viewerId || row.provider !== 'espn') return null
  const db = dbFromD1(env.DB)
  const enabled = await movesEnabled(db, viewerId)
  const roster = (row.matchup?.mine.lineup ?? [])
    .map((p): RosterPlayer => ({
      espnId: p.espnId,
      name: p.name,
      positionId: p.positionId,
      proTeamId: p.proTeamId,
      headshot: p.headshot ?? null,
      playerId: p.playerId ?? null,
      teamId: p.teamId ?? null,
      teamAbbrev: p.teamAbbrev ?? null,
      teamLogo: p.teamLogo ?? null,
      slot: p.slot,
      starter: p.starter,
      injury: p.injury,
    }))
    .sort((a, b) => Number(b.starter) - Number(a.starter))
  let budget: MoveBudget | null = null
  if (enabled && row.teamId !== null) {
    const session = await loadSession(env, viewerId)
    if (session) {
      const league = await leagueRosters(
        session,
        row.sport,
        row.season,
        row.leagueId,
      ).catch(() => null)
      const teamId = league ? myTeamId(league, session.swid, row.teamId) : null
      budget = league && teamId !== null ? budgetOf(league, teamId) : null
    }
  }
  const moves = await db
    .select()
    .from(fantasyMoves)
    .where(eq(fantasyMoves.leagueRowId, row.id))
    .orderBy(desc(fantasyMoves.createdAt))
    .limit(MOVES_SHOWN)
  return { enabled, roster, budget, moves: moves.map(moveOf) }
}

export interface MoveRequest {
  /** The page's id for the move, made when its sheet opened. */
  moveId: string
  kind: MoveKind
  /** Who to add or claim (the name as the Players tab showed it). */
  add: MovePlayer | null
  /** Who to drop: an ESPN id, named from the Viewer's roster. */
  dropId: number | null
  bid: number | null
}

/**
 * Make a move the Viewer confirmed: checked against the league's rosters
 * read now, recorded, then sent to ESPN once. A move already recorded
 * under its id is returned as it stands, never sent again.
 */
export async function sendMove(
  env: Env,
  viewerId: string,
  row: LeagueRow,
  request: MoveRequest,
  now = new Date(),
): Promise<FantasyMove> {
  if (row.viewerId !== viewerId || row.provider !== 'espn')
    throw new UserError('Moves work only in ESPN leagues.')
  const db = dbFromD1(env.DB)
  const existing = await db
    .select()
    .from(fantasyMoves)
    .where(
      and(
        eq(fantasyMoves.id, request.moveId),
        eq(fantasyMoves.viewerId, viewerId),
      ),
    )
    .get()
  if (existing) return moveOf(existing)
  if (!(await movesEnabled(db, viewerId)))
    throw new UserError('Turn on roster moves for ESPN on the Fantasy page.')
  const hourAgo = new Date(now.getTime() - 60 * 60_000).toISOString()
  const recent = await db
    .select({
      leagueRowId: fantasyMoves.leagueRowId,
      status: fantasyMoves.status,
      updatedAt: fantasyMoves.updatedAt,
    })
    .from(fantasyMoves)
    .where(
      and(
        eq(fantasyMoves.viewerId, viewerId),
        gt(fantasyMoves.createdAt, hourAgo),
      ),
    )
  if (recent.length >= MOVES_PER_HOUR)
    throw new UserError(
      `That’s ${MOVES_PER_HOUR} moves this hour, the most Sportsline makes. Try again later, or make it on ESPN.`,
    )
  const stuck = now.getTime() - STUCK_MS
  if (
    recent.some(
      (m) =>
        m.leagueRowId === row.id &&
        m.status === 'sending' &&
        Date.parse(m.updatedAt) > stuck,
    )
  )
    throw new UserError('Another move in this league is still on its way.')
  const session = await loadSession(env, viewerId)
  if (!session) throw new UserError('Connect ESPN again to make moves.')
  const league = await leagueRosters(
    session,
    row.sport,
    row.season,
    row.leagueId,
  ).catch(() => {
    throw new UserError('Couldn’t read the league from ESPN. Nothing was sent.')
  })
  const teamId = myTeamId(league, session.swid, row.teamId)
  if (teamId === null)
    throw new UserError('Couldn’t find your team in this league.')
  const rosters = rosteredBy(league)
  const named = new Map(
    (league.teams ?? []).flatMap((t) =>
      (t.roster?.entries ?? []).flatMap((e) => {
        const p = e.playerPoolEntry?.player
        const id = p?.id ?? e.playerId
        return id === undefined ? [] : [[id, p?.fullName ?? `#${id}`] as const]
      }),
    ),
  )
  const drop =
    request.dropId === null
      ? null
      : {
          espnId: request.dropId,
          name: named.get(request.dropId) ?? `#${request.dropId}`,
        }
  const add = request.kind === 'drop' ? null : request.add
  const refused = checkMove({ kind: request.kind, add, drop, teamId, rosters })
  if (refused) throw new UserError(refused)
  const budget = request.kind === 'claim' ? budgetOf(league, teamId) : null
  const bid = budget ? Math.round(request.bid ?? 0) : null
  if (budget && bid !== null && (bid < budget.minimum || bid > budget.left))
    throw new UserError(
      `Bid between $${budget.minimum} and $${budget.left}, what’s left of your budget.`,
    )
  const stamp = now.toISOString()
  const recorded = await db
    .insert(fantasyMoves)
    .values({
      id: request.moveId,
      viewerId,
      leagueRowId: row.id,
      kind: request.kind,
      add,
      drop,
      bid,
      status: 'sending',
      reason: null,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .onConflictDoNothing()
    .returning()
  // Recorded by a request alongside this one: that one sends it.
  if (recorded.length === 0) {
    const other = await db
      .select()
      .from(fantasyMoves)
      .where(eq(fantasyMoves.id, request.moveId))
      .get()
    if (!other || other.viewerId !== viewerId)
      throw new UserError('That move couldn’t be made.')
    return moveOf(other)
  }
  const reply = await postMove(session, row.sport, row.season, row.leagueId, {
    ...moveBody({
      kind: request.kind,
      teamId,
      memberId: bracedSwid(session.swid),
      scoringPeriod:
        league.scoringPeriodId ?? league.status?.latestScoringPeriod ?? 1,
      add: add?.espnId ?? null,
      drop: drop?.espnId ?? null,
      bid,
    }),
  })
  const outcome = readMoveReply(request.kind, reply.status, reply.body)
  const updatedAt = new Date().toISOString()
  await db
    .update(fantasyMoves)
    .set({ status: outcome.status, reason: outcome.reason, updatedAt })
    .where(eq(fantasyMoves.id, request.moveId))
  if (outcome.status === 'unknown' || (reply.status ?? 0) >= 500)
    await reportError(
      env,
      'espn',
      new Error(`ESPN move ${reply.status ?? 'no answer'}`),
      {
        viewerId,
        step: 'roster-move',
      },
    )
  return { ...moveOf(recorded[0]), ...outcome, updatedAt }
}
