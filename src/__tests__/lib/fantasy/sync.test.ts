/**
 * ESPN Fantasy sync: discovery, matching Players and storing a Matchup.
 * ESPN itself is a stand-in. Bun only.
 */

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import basketball from '../../fixtures/fantasy/basketball-category-matchup.json'
import type * as Db from '@/lib/db'
import type { EspnError as EspnErrorClass } from '@/lib/fantasy/client'
import type { MatchupView, WireLeague } from '@/lib/fantasy/matchup'
import type * as Sync from '@/lib/fantasy/sync'
import type * as Vault from '@/lib/kalshi/vault'
import type * as FantasyClient from '@/lib/fantasy/client'

const state = vi.hoisted(() => ({
  db: null as unknown,
  profile: null as unknown,
  profileError: null as Error | null,
  views: null as unknown,
  viewError: null as Error | null,
  topics: [] as Array<unknown>,
  cards: null as Array<unknown> | null,
  pool: [] as Array<unknown>,
  waivers: [] as Array<unknown>,
  weekViews: new Map<number, unknown>(),
  weekReads: [] as Array<number>,
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
    // The stand-in cookies are never sealed again.
    isLegacy: () => false,
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
    leagueViews: (
      _s: unknown,
      _sport: unknown,
      _season: unknown,
      _id: unknown,
      period?: number,
    ) => {
      if (state.viewError) return Promise.reject(state.viewError)
      if (period !== undefined && state.weekViews.has(period)) {
        state.weekReads.push(period)
        return Promise.resolve(state.weekViews.get(period))
      }
      return Promise.resolve(state.views)
    },
    leagueActivity: () => Promise.resolve(state.topics),
    playerCards: () =>
      state.cards
        ? Promise.resolve(state.cards)
        : Promise.reject(new Error('ESPN 400')),
    playerPool: () => Promise.resolve(state.pool),
    waiverClaims: () => Promise.resolve(state.waivers),
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
    state.topics = []
    state.cards = []
    state.pool = []
    state.waivers = []
    state.weekViews = new Map()
    state.weekReads = []
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
      standings: null,
      leaders: null,
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
    // Stamped when read, so the Viewer can see how old the scores are.
    expect(Number.isNaN(Date.parse(mapped.asOf ?? ''))).toBe(false)
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
      standings: null,
      leaders: null,
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

  it('maps a Sleeper NFL team by abbreviation when the Source id is missing', async () => {
    sqlite.run(
      "INSERT INTO teams (id,league,name,abbreviation,logo_url) VALUES ('tm_buf','nfl','Buffalo Bills','BUF',NULL)",
    )
    sqlite.run(
      "INSERT INTO fantasy_leagues (id,viewer_id,sport,provider,league_id,season,name,updated_at) VALUES ('u1~football~s','u1','football','sleeper','L',2026,'Roll tide!','x')",
    )
    const row = (
      await db.select().from((await import('@/lib/db/schema')).fantasyLeagues)
    ).find((league) => league.id === 'u1~football~s')
    await sync.storeMatchup(db, row!, sleeperAllen(), {
      season: 2026,
      teamId: 8,
      lastError: null,
      standings: null,
      leaders: null,
    })
    const matchup = JSON.parse(
      String(
        (
          sqlite as unknown as {
            query: (sql: string) => { get: () => { matchup: string } }
          }
        )
          .query(
            "SELECT matchup FROM fantasy_leagues WHERE id = 'u1~football~s'",
          )
          .get().matchup,
      ),
    ) as MatchupView
    expect(matchup.mine.lineup[0]).toMatchObject({
      name: 'Josh Allen',
      proTeamId: 2,
      teamId: 'tm_buf',
      teamAbbrev: 'BUF',
    })
  })

  it('keeps the league’s Standings with its Matchup', async () => {
    const { fantasyLeagues } = await import('@/lib/db/schema')
    sqlite.run(
      "INSERT INTO fantasy_leagues (id,viewer_id,sport,provider,league_id,season,name,updated_at) VALUES ('u1~football~st','u1','football','sleeper','L',2026,'Standings','x')",
    )
    const row = (await db.select().from(fantasyLeagues)).find(
      (league) => league.id === 'u1~football~st',
    )
    const standings = {
      rows: [
        {
          teamId: 8,
          name: 'Mine',
          abbrev: 'MINE',
          logo: null,
          rank: 1,
          wins: 3,
          losses: 1,
          ties: 0,
          pointsFor: 512.04,
          pointsAgainst: 430.5,
          streak: 'W2',
          mine: true,
        },
      ],
      playoffTeams: 6,
    }
    await sync.storeMatchup(db, row!, sleeperAllen(), {
      season: 2026,
      teamId: 8,
      lastError: null,
      standings,
      leaders: null,
    })
    const stored = (await db.select().from(fantasyLeagues)).find(
      (league) => league.id === 'u1~football~st',
    )
    expect(stored?.standings).toEqual(standings)
  })

  it('keeps rosters hourly, an Injury Event between two becoming Who Has?', async () => {
    const { fantasyLeagues, whoHas } = await import('@/lib/db/schema')
    const { readTeamSides } = await import('@/lib/fantasy/matchup')
    const { rostersOf } = await import('@/lib/fantasy/whoHas')
    sqlite.run(
      "INSERT INTO fantasy_leagues (id,viewer_id,sport,provider,league_id,season,name,updated_at) VALUES ('u1~basketball~wh','u1','basketball','espn','wh',2026,'Hoops','x')",
    )
    const league = basketball as unknown as WireLeague
    const sides = readTeamSides('basketball', league)
    const theirs = sides.find((s) => s.teamId === 1)!
    const hurt = theirs.lineup.find((p) => p.starter && !p.injury)!
    const row = (await db.select().from(fantasyLeagues)).find(
      (l) => l.id === 'u1~basketball~wh',
    )!
    const now = new Date('2026-10-20T12:00:00Z')
    // Kept two hours ago, all healthy; now one of team 1's Starters is out.
    row.rosters = rostersOf(sides, new Date(now.getTime() - 2 * 3_600_000))
    hurt.injury = 'OUT'
    const kept = await sync.keepLeague(
      db,
      row,
      { scoringPeriod: 1, sides, mine: 2, categories: null },
      now,
    )
    expect(kept.rosters?.at).toBe(now.toISOString())
    expect(kept.leaders.teams).toHaveLength(2)
    const encounters = await db.select().from(whoHas)
    expect(encounters).toHaveLength(1)
    expect(encounters[0]).toMatchObject({
      id: `u1~basketball~wh~${hurt.espnId}~OUT`,
      viewerId: 'u1',
      status: 'OUT',
      ownerTeamId: 1,
      answeredAt: null,
    })
    expect(encounters[0].player.name).toBe(hurt.name)
    expect(encounters[0].options.map((o) => o.teamId).sort()).toEqual([1, 2])

    // Kept a minute ago: not due, and nothing new.
    row.rosters = kept.rosters!
    const again = await sync.keepLeague(
      db,
      row,
      { scoringPeriod: 1, sides, mine: 2, categories: null },
      new Date(now.getTime() + 60_000),
    )
    expect(again.rosters).toBeUndefined()
    expect(await db.select().from(whoHas)).toHaveLength(1)
  })

  it('reads ESPN Activity, naming Players from ESPN or else the rosters', async () => {
    const { fantasyLeagues } = await import('@/lib/db/schema')
    sqlite.run(
      "INSERT INTO fantasy_leagues (id,viewer_id,sport,provider,league_id,season,name,updated_at) VALUES ('u1~football~act','u1','football','espn','act',2026,'Act','x')",
    )
    const row = (await db.select().from(fantasyLeagues)).find(
      (l) => l.id === 'u1~football~act',
    )!
    row.standings = {
      rows: [
        {
          teamId: 3,
          name: 'Bronx Bombers',
          abbrev: 'BB',
          logo: null,
          rank: 1,
          wins: 1,
          losses: 0,
          ties: 0,
          pointsFor: null,
          pointsAgainst: null,
          streak: null,
          mine: true,
        },
      ],
      playoffTeams: null,
    }
    row.rosters = {
      at: '2026-10-20T00:00:00Z',
      teams: [
        {
          teamId: 3,
          name: 'Bronx Bombers',
          abbrev: 'BB',
          players: [
            {
              espnId: 2,
              name: 'Rostered Name',
              injury: null,
              starter: true,
              owned: null,
            },
          ],
        },
      ],
    }
    state.topics = [
      {
        id: 't1',
        date: Date.parse('2026-10-19T12:00:00Z'),
        messages: [
          { messageTypeId: 178, targetId: 1, to: 3 },
          { messageTypeId: 179, targetId: 2, to: 3 },
        ],
      },
    ]
    state.cards = [
      { id: 1, fullName: 'Josh Allen', proTeamId: 2, defaultPositionId: 1 },
    ]
    const read = await sync.readActivity(env, 'u1', row)
    expect(read?.teams).toEqual([
      { teamId: 3, name: 'Bronx Bombers', abbrev: 'BB' },
    ])
    expect(
      read?.entries[0].items.map((i) => [i.player.name, i.player.teamAbbrev]),
    ).toEqual([
      ['Josh Allen', 'BUF'],
      ['Rostered Name', null],
    ])

    // ESPN's lookup failing leaves the rosters' names.
    state.cards = null
    const fallback = await sync.readActivity(env, 'u1', row)
    expect(fallback?.entries[0].items.map((i) => i.player.name)).toEqual([
      'Player 1',
      'Rostered Name',
    ])
    // The most rostered Players name who a lookup by id didn't.
    state.pool = [{ id: 1, fullName: 'Josh Allen', proTeamId: 2 }]
    const pooled = await sync.readActivity(env, 'u1', row)
    expect(pooled?.entries[0].items[0].player.name).toBe('Josh Allen')
    // Not the Viewer's league: nothing read.
    expect(await sync.readActivity(env, 'u2', row)).toBeNull()
  })

  it('names a Player ESPN didn’t from ours, and shows a contested claim', async () => {
    const { fantasyLeagues } = await import('@/lib/db/schema')
    sqlite.run(
      "INSERT INTO players (id,league,name) VALUES ('pl_allen','nfl','Josh Allen')",
    )
    sqlite.run(
      "INSERT INTO source_ids (entity,source,source_id,internal_id) VALUES ('player','espn','3918298','pl_allen')",
    )
    sqlite.run(
      "INSERT INTO fantasy_leagues (id,viewer_id,sport,provider,league_id,season,name,updated_at) VALUES ('u1~football~ours','u1','football','espn','ours',2026,'Ours','x')",
    )
    const row = (await db.select().from(fantasyLeagues)).find(
      (l) => l.id === 'u1~football~ours',
    )!
    state.topics = [
      {
        id: 'w',
        date: 1,
        messages: [{ messageTypeId: 180, targetId: 3918298, to: 5, from: 12 }],
      },
    ]
    state.cards = []
    state.waivers = [
      {
        status: 'EXECUTED',
        scoringPeriodId: 6,
        bidAmount: 12,
        teamId: 5,
        items: [{ playerId: 3918298, type: 'ADD' }],
      },
      {
        status: 'FAILED_LOWBID',
        scoringPeriodId: 6,
        bidAmount: 3,
        teamId: 8,
        items: [{ playerId: 3918298, type: 'ADD' }],
      },
    ]
    const read = await sync.readActivity(env, 'u1', row)
    expect(read?.entries[0].items[0].player).toMatchObject({
      name: 'Josh Allen',
      playerId: 'pl_allen',
    })
    expect(read?.entries[0].claims).toEqual([
      { teamId: 5, bid: 12, won: true },
      { teamId: 8, bid: 3, won: false },
    ])
  })

  it('reads each finished week for What-if standings once it’s final', async () => {
    const { fantasyLeagues, fantasyWhatIf } = await import('@/lib/db/schema')
    const { readWhatIf } = await import('@/lib/fantasy/whatIfRead')
    sqlite.run(
      "INSERT INTO fantasy_leagues (id,viewer_id,sport,provider,league_id,season,name,updated_at) VALUES ('u1~football~wi','u1','football','espn','wi',2026,'WI','x')",
    )
    const row = (await db.select().from(fantasyLeagues)).find(
      (l) => l.id === 'u1~football~wi',
    )!
    row.matchup = { matchupPeriod: 4 } as MatchupView
    const week = (n: number) => ({
      settings: {
        scheduleSettings: { matchupPeriods: { [String(n)]: [n] } },
        rosterSettings: { lineupSlotCounts: { '0': 1 } },
      },
      teams: [
        { id: 1, abbrev: 'A', name: 'Alpha' },
        { id: 2, abbrev: 'B', name: 'Beta' },
      ],
      schedule: [
        {
          matchupPeriodId: n,
          winner: 'AWAY',
          home: {
            teamId: 1,
            totalPoints: 10,
            rosterForCurrentScoringPeriod: {
              entries: [
                {
                  lineupSlotId: 0,
                  playerPoolEntry: {
                    player: {
                      id: 1,
                      eligibleSlots: [0],
                      stats: [
                        {
                          scoringPeriodId: n,
                          statSourceId: 0,
                          appliedTotal: 10,
                        },
                      ],
                    },
                  },
                },
                {
                  lineupSlotId: 20,
                  playerPoolEntry: {
                    player: {
                      id: 2,
                      eligibleSlots: [0, 20],
                      stats: [
                        {
                          scoringPeriodId: n,
                          statSourceId: 0,
                          appliedTotal: 30,
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
          away: {
            teamId: 2,
            totalPoints: 20,
            rosterForCurrentScoringPeriod: { entries: [] },
          },
        },
      ],
    })
    for (const n of [1, 2, 3]) state.weekViews.set(n, week(n))
    const first = await readWhatIf(env, 'u1', row)
    expect(state.weekReads.sort()).toEqual([1, 2, 3])
    expect(first?.weeks).toBe(3)
    expect(first?.rows[0]).toMatchObject({
      teamId: 1,
      wins: 0,
      losses: 3,
      whatIfWins: 3,
      benchLeft: 60,
      flips: 3,
    })
    // Weeks 1 and 2 are final; last week is read again.
    state.weekReads = []
    await readWhatIf(env, 'u1', row)
    expect(state.weekReads).toEqual([3])
    expect(
      (await db.select().from(fantasyWhatIf)).map((w) => [w.week, w.final]),
    ).toEqual([
      [1, true],
      [2, true],
      [3, false],
    ])
  })

  it('reads an earlier day of a category Matchup on demand', async () => {
    const { fantasyLeagues } = await import('@/lib/db/schema')
    const { readMatchup } = await import('@/lib/fantasy/matchup')
    const league = basketball as unknown as WireLeague
    const view = readMatchup('basketball', league, 1)!
    sqlite.run(
      "INSERT INTO fantasy_leagues (id,viewer_id,sport,league_id,season,team_id,name,updated_at) VALUES ('u1~basketball~5','u1','basketball','5',2027,1,'Hoops','x')",
    )
    await db
      .update(fantasyLeagues)
      .set({ matchup: view })
      .where(eq(fantasyLeagues.id, 'u1~basketball~5'))
    const asked: Array<number | undefined> = []
    const client = await import('@/lib/fantasy/client')
    vi.spyOn(client, 'leagueViews').mockImplementation(((
      _s,
      _sport,
      _season,
      _id,
      scoringPeriod?: number,
    ) => {
      asked.push(scoringPeriod)
      return Promise.resolve(league)
    }) as typeof client.leagueViews)

    // Today comes from the stored Matchup, a day outside the Matchup
    // isn't read, and nor is anyone else's league.
    expect(await sync.readDay(env, 'u1', 'u1~basketball~5', 85)).toBeNull()
    expect(await sync.readDay(env, 'u1', 'u1~basketball~5', 77)).toBeNull()
    expect(await sync.readDay(env, 'u2', 'u1~basketball~5', 84)).toBeNull()
    expect(asked).toEqual([])

    const day = await sync.readDay(env, 'u1', 'u1~basketball~5', 84)
    expect(asked).toEqual([84])
    expect(day?.scoringPeriod).toBe(84)
    expect(day?.categories.map((c) => c.label)).toContain('FG%')
    expect(day?.mine.length).toBeGreaterThan(0)

    // A later day of the Matchup is read too (its Lineups are set ahead).
    await db
      .update(fantasyLeagues)
      .set({ matchup: { ...view, scoringPeriod: 80 } })
      .where(eq(fantasyLeagues.id, 'u1~basketball~5'))
    expect(
      (await sync.readDay(env, 'u1', 'u1~basketball~5', 83))?.scoringPeriod,
    ).toBe(83)
    expect(asked).toEqual([84, 83])
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

function sleeperAllen(): MatchupView {
  return {
    sport: 'football',
    leagueName: 'Roll tide!',
    scoringType: 'H2H_POINTS',
    matchupPeriod: 5,
    scoringPeriod: 5,
    mine: {
      teamId: 8,
      name: 'Blaze',
      abbrev: 'BLZ',
      logo: null,
      record: null,
      score: 0,
      projected: null,
      lineup: [
        {
          espnId: 4984,
          name: 'Josh Allen',
          slot: 'QB',
          slotId: 0,
          positionId: 1,
          starter: true,
          points: null,
          projected: 22,
          proTeamId: 2,
          injury: null,
          breakdown: [],
        },
      ],
    },
    opponent: null,
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
