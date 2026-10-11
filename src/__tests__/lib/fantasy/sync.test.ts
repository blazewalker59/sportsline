/**
 * ESPN Fantasy sync: discovery, matching Players and storing a Matchup.
 * ESPN itself is a stand-in. Bun only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { EspnError as EspnErrorClass } from '@/lib/fantasy/client'
import type { MatchupView } from '@/lib/fantasy/matchup'
import type * as Sync from '@/lib/fantasy/sync'
import type * as Vault from '@/lib/kalshi/vault'
import type * as FantasyClient from '@/lib/fantasy/client'

const state = vi.hoisted(() => ({
  db: null as unknown,
  profile: null as unknown,
  profileError: null as Error | null,
  views: null as unknown,
  viewError: null as Error | null,
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

vi.mock('@/lib/kalshi/vault', async (original) => {
  const mod = await original<typeof Vault>()
  return {
    ...mod,
    unseal: (_key: string, sealed: { ciphertext: string }) =>
      Promise.resolve(sealed.ciphertext),
  }
})

vi.mock('@/lib/fantasy/client', async (original) => {
  const mod = await original<typeof FantasyClient>()
  return {
    ...mod,
    fanProfile: () =>
      state.profileError
        ? Promise.reject(state.profileError)
        : Promise.resolve(state.profile),
    leagueViews: () => {
      if (state.viewError) return Promise.reject(state.viewError)
      return Promise.resolve(state.views)
    },
  }
})

describe.skipIf(!isBun)('ESPN fantasy sync', () => {
  let sync: typeof Sync
  let EspnError: typeof EspnErrorClass
  let sqlite: { run: (sql: string) => void }
  let db: Db.Database
  const env = { DB: {}, ESPN_ENCRYPTION_KEY: 'key' } as Pick<
    Db.CloudflareEnv,
    'DB' | 'ESPN_ENCRYPTION_KEY'
  >

  beforeEach(async () => {
    vi.stubGlobal('fetch', () =>
      Promise.reject(new Error('unexpected network fetch')),
    )
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite
    db = fresh.db as unknown as Db.Database
    state.db = db
    state.profile = null
    state.profileError = null
    state.views = null
    state.viewError = null
    state.reports = []
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
    sqlite.run(
      "INSERT INTO espn_accounts (viewer_id,swid_ciphertext,swid_iv,s2_ciphertext,s2_iv,status,connected_at) VALUES ('u1','ABCD','i','s2','i','ok','2026-10-01T00:00:00Z')",
    )
    ;({ EspnError } = await import('@/lib/fantasy/client'))
    sync = await import('@/lib/fantasy/sync')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const leagues = () =>
    (
      sqlite as unknown as {
        query: (sql: string) => { all: () => Array<Record<string, unknown>> }
      }
    )
      .query(
        'SELECT id, season, team_id, name, last_error, provider FROM fantasy_leagues ORDER BY id',
      )
      .all()

  it('builds a league row id and returns nothing without a session', async () => {
    expect(sync.leagueRowId('u1', 'football', '99')).toBe('u1~football~99')
    sqlite.run('DELETE FROM espn_accounts')
    expect(await sync.syncAccount(env, 'u1')).toBe(0)
    expect(await sync.loadSession(env, 'u1')).toBeNull()
  })

  it('discovers leagues and remembers a failed discovery for the day', async () => {
    const session = await sync.loadSession(env, 'u1')
    expect(session).toEqual({ swid: 'ABCD', espnS2: 's2' })
    state.profile = null
    expect(await sync.discover(db, 'u1', session!)).toBe(0)
    state.profile = {
      preferences: [
        {
          id: 'pref',
          metaData: {
            entry: {
              gameId: 1,
              groups: [{ groupId: '4242', groupName: 'Office' }],
              abbrev: 'Mine',
            },
          },
        },
      ],
    }
    expect(await sync.discover(db, 'u1', session!)).toBeGreaterThan(0)
    expect(leagues()[0]?.id).toBe('u1~football~4242')
    const again = await sync.discover(db, 'u1', session!)
    expect(again).toBeGreaterThan(0)
    expect(leagues()).toHaveLength(1)

    sqlite.run('DELETE FROM fantasy_leagues')
    sqlite.run('UPDATE espn_accounts SET discovered_at = NULL')
    state.profileError = new Error('fan down')
    await sync.syncAccount(env, 'u1')
    expect(state.reports).toEqual(['espn'])
    const account = (
      sqlite as unknown as {
        query: (sql: string) => {
          get: () => { discovered_at: string; status: string }
        }
      }
    )
      .query('SELECT discovered_at, status FROM espn_accounts')
      .get()
    expect(account.discovered_at).toBeTruthy()
    expect(account.status).toBe('ok')
  })

  it('reads a league, maps Players, and falls back a season on 404', async () => {
    sqlite.run(
      "INSERT INTO teams (id,league,name,abbreviation,logo_url) VALUES ('tm_kc','nfl','Kansas City Chiefs','KC','https://logo/kc.png'),('tm_nyy','mlb','New York Yankees','NYY',NULL)",
    )
    sqlite.run(
      "INSERT INTO source_ids (entity,source,source_id,internal_id) VALUES ('player','espn','123','pl_mah'),('team','espn','12','tm_kc')",
    )
    sqlite.run(
      "INSERT INTO players (id,league,name,headshot_url) VALUES ('pl_mah','nfl','Patrick Mahomes','https://head/mah.png'),('pl_judge','mlb','Aaron Judge',NULL),('pl_moore','nfl','D.J. Moore',NULL)",
    )
    const session = { swid: 'ABCD', espnS2: 's2' }
    state.viewError = new EspnError(404, 'ESPN 404')
    sqlite.run(
      `INSERT INTO fantasy_leagues (id,viewer_id,sport,league_id,season,name,updated_at) VALUES ('u1~football~7','u1','football','7',${new Date().getUTCFullYear()},'Office','x')`,
    )
    const row = await db
      .select()
      .from((await import('@/lib/db/schema')).fantasyLeagues)
      .then((rows) => rows[0])
    await expect(sync.syncLeague(db, session, row!)).rejects.toBe(
      state.viewError,
    )

    const seasonAsked: Array<number> = []
    const client = await import('@/lib/fantasy/client')
    vi.spyOn(client, 'leagueViews').mockImplementation(((
      _s,
      _sport,
      season: number,
    ) => {
      seasonAsked.push(season)
      if (seasonAsked.length === 1)
        return Promise.reject(new EspnError(404, 'missing'))
      return Promise.resolve(wireLeague())
    }) as typeof client.leagueViews)
    await sync.syncLeague(db, session, row!)
    expect(seasonAsked[1]).toBe(seasonAsked[0]! - 1)
    const stored = leagues()[0]
    expect(stored?.name).toBe('Office League')
    expect(stored?.team_id).toBe(7)
    const players = (
      sqlite as unknown as {
        query: (sql: string) => { all: () => Array<Record<string, unknown>> }
      }
    )
      .query(
        'SELECT espn_id, side, player_id, starter FROM fantasy_players ORDER BY espn_id',
      )
      .all()
    expect(players).toEqual([
      { espn_id: -12, side: 'mine', player_id: null, starter: 1 },
      { espn_id: 123, side: 'mine', player_id: 'pl_mah', starter: 1 },
    ])
    const matchup = JSON.parse(
      String(
        (
          sqlite as unknown as {
            query: (sql: string) => { get: () => { matchup: string } }
          }
        )
          .query('SELECT matchup FROM fantasy_leagues')
          .get().matchup,
      ),
    ) as MatchupView
    const defense = matchup.mine.lineup.find((player) => player.espnId === -12)
    expect(defense?.teamAbbrev).toBe('KC')
    expect(defense?.teamLogo).toContain('/nfl/500-dark/kc.png')
    expect(defense?.teamId).toBe('tm_kc')

    const baseball = baseballView()
    sqlite.run(
      "INSERT INTO fantasy_leagues (id,viewer_id,sport,provider,league_id,season,name,updated_at) VALUES ('u1~baseball~1','u1','baseball','sleeper','1',2026,'Dynasty','x')",
    )
    const baseballRow = (
      await db.select().from((await import('@/lib/db/schema')).fantasyLeagues)
    ).find((league) => league.id === 'u1~baseball~1')
    await sync.storeMatchup(db, baseballRow!, baseball, {
      season: 2026,
      teamId: 1,
      lastError: null,
    })
    const mapped = JSON.parse(
      String(
        (
          sqlite as unknown as {
            query: (sql: string) => { get: () => { matchup: string } }
          }
        )
          .query(
            "SELECT matchup FROM fantasy_leagues WHERE id = 'u1~baseball~1'",
          )
          .get().matchup,
      ),
    ) as MatchupView
    expect(mapped.mine.lineup[0]?.playerId).toBe('pl_judge')
    expect(mapped.mine.lineup[0]?.teamAbbrev).toBe('NYY')
    const points = (
      sqlite as unknown as {
        query: (sql: string) => { all: () => Array<{ mine: number }> }
      }
    )
      .query(
        "SELECT mine FROM fantasy_score_points WHERE league_row_id = 'u1~baseball~1'",
      )
      .all()
    expect(points).toHaveLength(1)
    await sync.storeMatchup(db, baseballRow!, baseball, {
      season: 2026,
      teamId: 1,
      lastError: null,
    })
    expect(
      (
        sqlite as unknown as {
          query: (sql: string) => { all: () => Array<unknown> }
        }
      )
        .query(
          "SELECT mine FROM fantasy_score_points WHERE league_row_id = 'u1~baseball~1'",
        )
        .all(),
    ).toHaveLength(1)
  })

  it('keeps a league error on that league, and signs the account out on 401', async () => {
    sqlite.run(
      "INSERT INTO fantasy_leagues (id,viewer_id,sport,league_id,season,name,enabled,updated_at) VALUES ('u1~football~1','u1','football','1',2026,'One',1,'x'),('u1~football~2','u1','football','2',2026,'Two',1,'x'),('u1~football~3','u1','football','3',2026,'Off',0,'x')",
    )
    state.viewError = new Error('boom')
    expect(await sync.syncAccount(env, 'u1')).toBe(0)
    expect(leagues().map((row) => row.last_error)).toEqual([
      'Error: boom',
      'Error: boom',
      null,
    ])
    const status = (
      sqlite as unknown as {
        query: (sql: string) => { get: () => { status: string } }
      }
    )
      .query('SELECT status FROM espn_accounts')
      .get()
    expect(status.status).toBe('ok')

    state.viewError = new EspnError(401, 'ESPN 401')
    await expect(sync.syncAccount(env, 'u1')).rejects.toBeInstanceOf(EspnError)
    const failed = (
      sqlite as unknown as {
        query: (sql: string) => {
          get: () => { status: string; last_error: string }
        }
      }
    )
      .query('SELECT status, last_error FROM espn_accounts')
      .get()
    expect(failed.status).toBe('error')
    expect(failed.last_error).toContain('Reconnect')
  })

  it('lists accounts due a sync, oldest first', async () => {
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u2','W','w@example.com',1,0,0),('u3','X','x@example.com',1,0,0)",
    )
    const recent = new Date(Date.now() + 60_000).toISOString()
    const old = new Date(Date.now() - 2 * 60_000).toISOString()
    sqlite.run(
      `INSERT INTO espn_accounts (viewer_id,swid_ciphertext,swid_iv,s2_ciphertext,s2_iv,status,connected_at,synced_at) VALUES ('u2','s','i','s2','i','ok','2026-10-01T00:00:00Z','${recent}'),('u3','s','i','s2','i','ok','2026-10-01T00:00:00Z','${old}')`,
    )
    const due = await sync.accountsDue(env, 60_000, 10)
    expect(due[0]).toBe('u1')
    expect(due).toContain('u3')
    expect(due).not.toContain('u2')
    expect(await sync.accountsDue(env, 60_000, 1)).toEqual(['u1'])
  })
})

function wireLeague() {
  const player = (
    id: number,
    name: string,
    proTeamId: number,
    slot: number,
  ) => ({
    lineupSlotId: slot,
    playerPoolEntry: {
      player: { id, fullName: name, proTeamId, defaultPositionId: 1 },
    },
  })
  return {
    id: 7,
    scoringPeriodId: 1,
    status: { currentMatchupPeriod: 1 },
    settings: {
      name: 'Office League',
      scoringSettings: { scoringType: 'H2H_POINTS' },
    },
    teams: [
      { id: 7, name: 'Mine', owners: ['{ABCD}'] },
      { id: 8, name: 'Them', owners: ['{ZZ}'] },
    ],
    schedule: [
      {
        matchupPeriodId: 1,
        home: {
          teamId: 7,
          totalPointsLive: 12,
          rosterForCurrentScoringPeriod: {
            entries: [
              player(123, 'Patrick Mahomes', 12, 0),
              player(-12, 'Chiefs D/ST', 12, 16),
            ],
          },
        },
        away: {
          teamId: 8,
          totalPointsLive: 4,
          rosterForCurrentScoringPeriod: { entries: [] },
        },
      },
    ],
  }
}

function baseballView(): MatchupView {
  return {
    sport: 'baseball',
    leagueName: 'Dynasty',
    scoringType: 'H2H_POINTS',
    matchupPeriod: 3,
    scoringPeriod: 3,
    mine: {
      teamId: 1,
      name: 'Mine',
      abbrev: 'MIN',
      logo: null,
      record: null,
      score: 8,
      projected: 10,
      lineup: [
        {
          espnId: 999,
          name: 'Aaron Judge',
          slot: 'OF',
          slotId: 5,
          positionId: null,
          starter: true,
          points: 8,
          projected: 10,
          proTeamId: 10,
          injury: null,
          breakdown: [],
        },
      ],
    },
    opponent: {
      teamId: 2,
      name: 'Them',
      abbrev: 'THM',
      logo: null,
      record: null,
      score: 3,
      projected: 4,
      lineup: [],
    },
  }
}
