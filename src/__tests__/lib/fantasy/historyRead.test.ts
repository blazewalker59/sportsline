/**
 * A league's History read: which seasons are read from the provider and
 * which are kept. The providers are stand-ins. Bun only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type * as Vault from '@/lib/kalshi/vault'
import type * as FantasyClient from '@/lib/fantasy/client'
import type * as SleeperClient from '@/lib/fantasy/sleeper/client'
import type * as HistoryRead from '@/lib/fantasy/historyRead'
import type { WireLeague } from '@/lib/fantasy/matchup'

const SWID = 'ABCD'

const state = vi.hoisted(() => ({
  db: null as unknown,
  espn: new Map<number, unknown>(),
  espnReads: [] as Array<number>,
  sleeper: new Map<string, { league: unknown; week: Array<unknown> }>(),
  sleeperReads: [] as Array<string>,
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))

vi.mock('@/lib/kalshi/vault', async (original) => ({
  ...(await original<typeof Vault>()),
  unseal: (_key: string, sealed: { ciphertext: string }) =>
    Promise.resolve(sealed.ciphertext),
  isLegacy: () => false,
}))

vi.mock('@/lib/fantasy/client', async (original) => ({
  ...(await original<typeof FantasyClient>()),
  seasonLeague: (_s: unknown, _sport: unknown, season: number) => {
    state.espnReads.push(season)
    const wire = state.espn.get(season)
    return wire instanceof Error
      ? Promise.reject(wire)
      : Promise.resolve(wire ?? {})
  },
}))

vi.mock('@/lib/fantasy/sleeper/client', async (original) => {
  const mod = await original<typeof SleeperClient>()
  const of = (id: string) => state.sleeper.get(id)!
  return {
    ...mod,
    league: (id: string) => {
      state.sleeperReads.push(id)
      return Promise.resolve(of(id).league)
    },
    rosters: () =>
      Promise.resolve([
        { roster_id: 1, owner_id: 'me' },
        { roster_id: 2, owner_id: 'them' },
      ]),
    leagueUsers: () =>
      Promise.resolve([
        { user_id: 'me', display_name: 'Me' },
        { user_id: 'them', display_name: 'Them' },
      ]),
    winnersBracket: () =>
      Promise.resolve([{ r: 1, m: 1, t1: 1, t2: 2, w: 1, l: 2, p: 1 }]),
    matchups: (id: string, week: number) =>
      Promise.resolve(of(id).week[week - 1] ?? []),
  }
})

/** Two teams, the Viewer's first; one regular game, one final. */
const espnWire = (season: number, earlier: Array<number> = []): WireLeague => ({
  seasonId: season,
  status: {
    previousSeasons: earlier,
    latestScoringPeriod: 3,
    finalScoringPeriod: 17,
  },
  settings: { name: 'League', scoringSettings: { scoringType: 'H2H_POINTS' } },
  members: [
    { id: `{${SWID}}`, firstName: 'Vee' },
    { id: '{BBBB}', firstName: 'Bee' },
  ],
  teams: [
    { id: 1, name: 'Mine', owners: [`{${SWID}}`] },
    { id: 2, name: 'Theirs', owners: ['{BBBB}'] },
  ],
  schedule: [
    {
      matchupPeriodId: 1,
      playoffTierType: 'NONE',
      winner: 'HOME',
      home: { teamId: 1, totalPoints: 100 + season - 2000 },
      away: { teamId: 2, totalPoints: 90 },
    },
    {
      matchupPeriodId: 2,
      playoffTierType: 'WINNERS_BRACKET',
      winner: 'AWAY',
      home: { teamId: 1, totalPoints: 80 },
      away: { teamId: 2, totalPoints: 95 },
    },
  ],
})

describe.skipIf(!isBun)('readHistory', () => {
  let read: typeof HistoryRead
  let sqlite: {
    run: (sql: string) => void
    query: (sql: string) => { all: () => Array<unknown> }
  }
  const env = { DB: {}, ESPN_ENCRYPTION_KEY: 'key' } as Pick<
    Db.CloudflareEnv,
    'DB' | 'ESPN_ENCRYPTION_KEY'
  >
  const NOW = Date.parse('2026-11-25T12:00:00Z')

  const row = (over: Record<string, unknown> = {}) =>
    ({
      id: 'lg1',
      viewerId: 'u1',
      sport: 'football',
      provider: 'espn',
      leagueId: '42',
      season: 2026,
      teamId: 1,
      name: 'League',
      ...over,
    }) as Parameters<typeof HistoryRead.readHistory>[2]

  beforeEach(async () => {
    vi.stubGlobal('fetch', () =>
      Promise.reject(new Error('unexpected network fetch')),
    )
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite
    state.db = fresh.db
    state.espn = new Map()
    state.espnReads = []
    state.sleeper = new Map()
    state.sleeperReads = []
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
    sqlite.run(
      `INSERT INTO espn_accounts (viewer_id,swid_ciphertext,swid_iv,s2_ciphertext,s2_iv,status,connected_at) VALUES ('u1','${SWID}','i','s2','i','ok','2026-10-01T00:00:00Z')`,
    )
    sqlite.run(
      "INSERT INTO fantasy_leagues (id,viewer_id,sport,provider,league_id,season,team_id,name,updated_at) VALUES ('lg1','u1','football','espn','42',2026,1,'League','2026-11-01T00:00:00Z')",
    )
    read = await import('@/lib/fantasy/historyRead')
  })

  afterEach(() => vi.unstubAllGlobals())

  it('reads the seasons ESPN names, and keeps them', async () => {
    state.espn.set(2026, espnWire(2026, [2024, 2025]))
    state.espn.set(2025, espnWire(2025))
    state.espn.set(2024, espnWire(2024))
    const h = (await read.readHistory(env, 'u1', row(), NOW))!
    expect(h.seasons).toEqual([2026, 2025, 2024])
    expect(state.espnReads.sort()).toEqual([2024, 2025, 2026])
    // The current season is on: its final isn't a title yet.
    expect(h.champions.map((c) => c.champion?.manager ?? null)).toEqual([
      null,
      'Bee',
      'Bee',
    ])
    // The Viewer is known by their SWID.
    expect(h.managers.find((m) => m.mine)?.name).toBe('Vee')
    expect(h.rivals).toMatchObject([{ name: 'Bee', wins: 3, playoffLosses: 3 }])
    const kept = sqlite
      .query('SELECT season, complete FROM fantasy_history ORDER BY season')
      .all()
    expect(kept).toEqual([
      { season: 2024, complete: 1 },
      { season: 2025, complete: 1 },
      { season: 2026, complete: 0 },
    ])
  })

  it('reads a complete season once, and the one being played hourly', async () => {
    state.espn.set(2026, espnWire(2026, [2025]))
    state.espn.set(2025, espnWire(2025))
    await read.readHistory(env, 'u1', row(), NOW)
    state.espnReads = []
    await read.readHistory(env, 'u1', row(), NOW + 30 * 60_000)
    expect(state.espnReads).toEqual([])
    await read.readHistory(env, 'u1', row(), NOW + read.HISTORY_FRESH_MS + 1)
    expect(state.espnReads).toEqual([2026])
  })

  it('names a season that wouldn’t read, keeps the rest, and tries it again next time', async () => {
    state.espn.set(2026, espnWire(2026, [2024, 2025]))
    state.espn.set(2025, new Error('ESPN 500'))
    state.espn.set(2024, espnWire(2024))
    const h = (await read.readHistory(env, 'u1', row(), NOW))!
    expect(h.seasons).toEqual([2026, 2024])
    expect(h.missing).toEqual([2025])
    state.espn.set(2025, espnWire(2025))
    state.espnReads = []
    const again = (await read.readHistory(env, 'u1', row(), NOW + 60_000))!
    expect(state.espnReads).toEqual([2025])
    expect(again.missing).toEqual([])
  })

  it('fails when the current season won’t read', async () => {
    state.espn.set(2026, new Error('ESPN 401'))
    await expect(read.readHistory(env, 'u1', row(), NOW)).rejects.toThrow(
      'ESPN 401',
    )
  })

  it('reads nothing for another Viewer’s league', async () => {
    expect(await read.readHistory(env, 'u2', row(), NOW)).toBeNull()
    expect(state.espnReads).toEqual([])
  })

  it('follows Sleeper’s seasons back through each league’s previous one', async () => {
    sqlite.run(
      "INSERT INTO sleeper_accounts (viewer_id,username,user_id,status,connected_at) VALUES ('u1','me','me','ok','2026-10-01T00:00:00Z')",
    )
    const week = [
      { roster_id: 1, matchup_id: 1, points: 120 },
      { roster_id: 2, matchup_id: 1, points: 100 },
    ]
    const league = (id: string, season: string, previous: string | null) => ({
      league_id: id,
      name: 'Dynasty',
      season,
      status: season === '2026' ? 'in_season' : 'complete',
      settings: { playoff_week_start: 2, last_scored_leg: 2 },
      previous_league_id: previous,
    })
    state.sleeper.set('S26', {
      league: league('S26', '2026', 'S25'),
      week: [week],
    })
    state.sleeper.set('S25', {
      league: league('S25', '2025', 'S24'),
      week: [week, week],
    })
    state.sleeper.set('S24', {
      league: league('S24', '2024', null),
      week: [week, week],
    })
    const sleeperRow = row({ provider: 'sleeper', leagueId: 'S26' })
    const h = (await read.readHistory(env, 'u1', sleeperRow, NOW))!
    expect(h.seasons).toEqual([2026, 2025, 2024])
    expect(state.sleeperReads).toEqual(['S26', 'S25', 'S24'])
    expect(h.champions.map((c) => c.mine)).toEqual([false, true, true])
    expect(h.rivals).toMatchObject([{ name: 'Them', wins: 3, playoffWins: 2 }])
    // Complete seasons are found by their league next time, not read.
    state.sleeperReads = []
    await read.readHistory(
      env,
      'u1',
      sleeperRow,
      NOW + read.HISTORY_FRESH_MS + 1,
    )
    expect(state.sleeperReads).toEqual(['S26'])
  })
})
