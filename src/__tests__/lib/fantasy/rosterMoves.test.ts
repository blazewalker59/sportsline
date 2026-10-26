/**
 * Roster moves (docs/adr/0010): checked against rosters read now, kept,
 * sent to ESPN once, and settled at the league's sync. ESPN itself is a
 * stand-in. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type * as FantasyClient from '@/lib/fantasy/client'
import type * as Moves from '@/lib/fantasy/rosterMoves'
import type * as Sync from '@/lib/fantasy/sync'
import type * as Vault from '@/lib/kalshi/vault'
import type { WireLeague } from '@/lib/fantasy/matchup'
import type { WireMove } from '@/lib/fantasy/moves'

const state = vi.hoisted(() => ({
  db: null as unknown,
  league: null as unknown,
  posts: [] as Array<unknown>,
  reply: { status: 200, body: {} } as { status: number | null; body: unknown },
  reports: [] as Array<string>,
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))

vi.mock('@/lib/ops/errors', () => ({
  reportError: (_env: unknown, scope: string) => {
    state.reports.push(scope)
    return Promise.resolve()
  },
}))

vi.mock('@/lib/kalshi/vault', async (original) => ({
  ...(await original<typeof Vault>()),
  unseal: (_key: string, sealed: { ciphertext: string }) =>
    Promise.resolve(sealed.ciphertext),
  isLegacy: () => false,
}))

vi.mock('@/lib/fantasy/client', async (original) => ({
  ...(await original<typeof FantasyClient>()),
  leagueRosters: () => Promise.resolve(state.league),
  postMove: (
    _s: unknown,
    _sport: unknown,
    _season: unknown,
    _id: unknown,
    move: WireMove,
  ) => {
    state.posts.push(move)
    return Promise.resolve(state.reply)
  },
}))

const entry = (id: number, name: string) => ({
  playerPoolEntry: { player: { id, fullName: name } },
})

const LEAGUE: WireLeague = {
  scoringPeriodId: 40,
  settings: {
    acquisitionSettings: {
      isUsingAcquisitionBudget: true,
      acquisitionBudget: 100,
      minimumBid: 0,
    },
  },
  teams: [
    {
      id: 3,
      owners: ['{ABCD}'],
      roster: { entries: [entry(22, 'Jordan Clarkson')] },
      transactionCounter: { acquisitionBudgetSpent: 90 },
    },
    { id: 4, owners: ['{OTHER}'], roster: { entries: [entry(33, 'Taken')] } },
  ],
}

describe.skipIf(!isBun)('roster moves', () => {
  let moves: typeof Moves
  let sync: typeof Sync
  let sqlite: {
    run: (sql: string) => void
    query: (sql: string) => { all: () => Array<Record<string, unknown>> }
  }
  let db: Db.Database
  const env = { DB: {}, ESPN_ENCRYPTION_KEY: 'key' } as Pick<
    Db.CloudflareEnv,
    'DB' | 'ESPN_ENCRYPTION_KEY'
  >
  let row: Awaited<ReturnType<typeof leagueRow>>
  const leagueRow = async () => {
    const { fantasyLeagues } = await import('@/lib/db/schema')
    return (await db.select().from(fantasyLeagues).get())!
  }
  const id = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const add = (n = 1) => ({
    moveId: id(n),
    kind: 'add' as const,
    add: { espnId: 11, name: 'Keegan Murray' },
    dropId: 22,
    bid: null,
  })
  const stored = () =>
    sqlite
      .query('SELECT id, kind, status, reason, bid, "drop" FROM fantasy_moves')
      .all()

  beforeEach(async () => {
    vi.stubGlobal('fetch', () =>
      Promise.reject(new Error('unexpected network fetch')),
    )
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite as typeof sqlite
    db = fresh.db as unknown as Db.Database
    state.db = db
    state.league = structuredClone(LEAGUE)
    state.posts = []
    state.reply = { status: 200, body: { status: 'EXECUTED' } }
    state.reports = []
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
    sqlite.run(
      "INSERT INTO espn_accounts (viewer_id,swid_ciphertext,swid_iv,s2_ciphertext,s2_iv,status,connected_at,moves_enabled) VALUES ('u1','ABCD','i','s2','i','ok','2026-10-01T00:00:00Z',1)",
    )
    sqlite.run(
      "INSERT INTO fantasy_leagues (id,viewer_id,sport,league_id,season,team_id,name,updated_at) VALUES ('u1~basketball~7','u1','basketball','7',2027,3,'Office','x')",
    )
    moves = await import('@/lib/fantasy/rosterMoves')
    sync = await import('@/lib/fantasy/sync')
    row = await leagueRow()
  })

  it('sends a confirmed move once, and keeps how it came out', async () => {
    const made = await moves.sendMove(env, 'u1', row, add())
    expect(made).toMatchObject({
      status: 'done',
      drop: { espnId: 22, name: 'Jordan Clarkson' },
    })
    expect(state.posts).toEqual([
      expect.objectContaining({
        type: 'FREEAGENT',
        teamId: 3,
        memberId: '{ABCD}',
        scoringPeriodId: 40,
        items: [
          { playerId: 11, type: 'ADD', toTeamId: 3 },
          { playerId: 22, type: 'DROP', fromTeamId: 3 },
        ],
      }),
    ])
    // The same move again (a double tap): what's kept, nothing sent.
    const again = await moves.sendMove(env, 'u1', row, add())
    expect(again.status).toBe('done')
    expect(state.posts).toHaveLength(1)
    expect(stored()).toHaveLength(1)
  })

  it('stops before sending when the rosters have moved on', async () => {
    await expect(
      moves.sendMove(env, 'u1', row, {
        ...add(),
        add: { espnId: 33, name: 'Taken' },
      }),
    ).rejects.toThrow('Taken is on another team now.')
    await expect(
      moves.sendMove(env, 'u1', row, { ...add(), dropId: 99 }),
    ).rejects.toThrow('isn’t on your team any more')
    expect(state.posts).toEqual([])
    expect(stored()).toEqual([])
  })

  it('holds a claim’s bid to what the budget has left', async () => {
    const claim = { ...add(), kind: 'claim' as const, bid: 11 }
    await expect(moves.sendMove(env, 'u1', row, claim)).rejects.toThrow(
      'Bid between $0 and $10',
    )
    state.reply = { status: 200, body: {} }
    const made = await moves.sendMove(env, 'u1', row, { ...claim, bid: 10 })
    expect(made).toMatchObject({ status: 'pending', bid: 10 })
    expect(state.posts).toEqual([
      expect.objectContaining({ type: 'WAIVER', bidAmount: 10 }),
    ])
  })

  it('keeps ESPN’s reason when it refuses', async () => {
    state.reply = {
      status: 409,
      body: { details: [{ message: 'Roster full' }] },
    }
    const made = await moves.sendMove(env, 'u1', row, {
      ...add(),
      dropId: null,
    })
    expect(made).toMatchObject({ status: 'refused', reason: 'Roster full' })
    expect(state.reports).toEqual([])
  })

  it('records a move with no answer as unknown, and reports it', async () => {
    state.reply = { status: null, body: null }
    const made = await moves.sendMove(env, 'u1', row, add())
    expect(made.status).toBe('unknown')
    expect(state.reports).toEqual(['espn'])
  })

  it('makes no move until the Viewer turns moves on', async () => {
    sqlite.run('UPDATE espn_accounts SET moves_enabled = 0')
    await expect(moves.sendMove(env, 'u1', row, add())).rejects.toThrow(
      'Turn on roster moves',
    )
    expect(state.posts).toEqual([])
  })

  it('makes at most ten moves an hour', async () => {
    const stamp = new Date().toISOString()
    for (let n = 0; n < 10; n++)
      sqlite.run(
        `INSERT INTO fantasy_moves (id,viewer_id,league_row_id,kind,status,created_at,updated_at) VALUES ('m${n}','u1','u1~basketball~7','add','refused','${stamp}','${stamp}')`,
      )
    await expect(moves.sendMove(env, 'u1', row, add(20))).rejects.toThrow(
      '10 moves this hour',
    )
  })

  it('settles a move with no answer from the rosters a sync reads', async () => {
    state.reply = { status: null, body: null }
    await moves.sendMove(env, 'u1', row, add())
    const after: WireLeague = structuredClone(LEAGUE)
    after.teams![0].roster!.entries = [entry(11, 'Keegan Murray')]
    await sync.settleMoves(db, row, after, 3)
    expect(stored()).toEqual([
      expect.objectContaining({ status: 'done', reason: null }),
    ])
  })

  it('offers the roster, the budget and the latest moves', async () => {
    sqlite.run(
      `UPDATE fantasy_leagues SET matchup = '${JSON.stringify({
        mine: {
          lineup: [
            {
              espnId: 23,
              name: 'Bench Guy',
              slot: 'Bench',
              starter: false,
              positionId: 1,
              proTeamId: 1,
              injury: null,
            },
            {
              espnId: 22,
              name: 'Jordan Clarkson',
              slot: 'G',
              starter: true,
              positionId: 1,
              proTeamId: 1,
              injury: null,
            },
          ],
        },
      })}'`,
    )
    await moves.sendMove(env, 'u1', row, add())
    const options = await moves.moveOptions(env, 'u1', await leagueRow())
    expect(options).toMatchObject({
      enabled: true,
      budget: { left: 10, total: 100, minimum: 0 },
    })
    expect(options?.roster.map((p) => p.name)).toEqual([
      'Jordan Clarkson',
      'Bench Guy',
    ])
    expect(options?.moves.map((m) => m.status)).toEqual(['done'])
  })
})
