/**
 * findBets on the real migrations: our Games and finals in SQLite, Kalshi's
 * offers a stand-in. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type { KalshiOffer } from '@/lib/sharp/engine'
import type { GameRef } from '@/lib/sharp/sources'
import type { findBets as FindBets } from '@/lib/sharp/onDemand'

const state = vi.hoisted(() => ({
  db: null as unknown,
  offersFor: [] as Array<string>,
}))
vi.mock('@/lib/kalshi/account', () => ({
  loadAccount: () => Promise.resolve(null),
}))
vi.mock('@/lib/sharp/kalshi', () => ({
  serviceAccount: () => Promise.resolve({ keyId: 'svc' }),
  kalshiOffers: (
    _env: unknown,
    _account: unknown,
    _db: unknown,
    refs: Array<GameRef>,
  ): Promise<Array<KalshiOffer>> => {
    state.offersFor.push(...refs.map((g) => g.gameId))
    return Promise.resolve(
      refs.flatMap((g) => {
        const base = {
          league: g.league,
          startsAt: g.startsAt,
          volume: 500,
          gameLabel: `${g.away.abbreviation} @ ${g.home.abbreviation}`,
        }
        const win = (
          teamId: string,
          abbr: string,
          ask: number,
          bid: number,
        ) => [
          {
            ...base,
            ticker: `${g.gameId}-${abbr}`,
            key: {
              gameId: g.gameId,
              kind: 'moneyline' as const,
              teamId,
              line: null,
            },
            side: 'yes' as const,
            price: ask,
            bid,
            title: `${abbr} win`,
          },
          {
            ...base,
            ticker: `${g.gameId}-${abbr}`,
            key: {
              gameId: g.gameId,
              kind: 'moneyline' as const,
              teamId,
              line: null,
            },
            side: 'no' as const,
            price: 1 - bid,
            bid: 1 - ask,
            title: `${abbr} lose`,
          },
        ]
        return [
          ...win(g.away.id, g.away.abbreviation, 0.5, 0.49),
          ...win(g.home.id, g.home.abbreviation, 0.52, 0.51),
        ]
      }),
    )
  },
}))

const env = {} as CloudflareEnv
// Wednesday 8 Oct 2026, 3pm Eastern.
const NOW = new Date('2026-10-08T19:00:00Z')

describe.skipIf(!isBun)('findBets', () => {
  let findBets: typeof FindBets
  let sqlite: { run: (sql: string) => void }
  let db: Db.Database
  let gameNo = 0

  const team = (id: string, league: string, name: string, abbr: string) =>
    sqlite.run(
      `INSERT INTO teams (id,league,name,abbreviation) VALUES ('${id}','${league}','${name}','${abbr}')`,
    )
  const addGame = (o: {
    id?: string
    league: string
    day: string
    startsAt: string
    status: string
    home: string
    away: string
    homeScore?: number
    awayScore?: number
  }) =>
    sqlite.run(
      `INSERT INTO games (id,league,sports_day,starts_at,status,home_team_id,away_team_id,home_score,away_score,updated_at)
       VALUES ('${o.id ?? `f${++gameNo}`}','${o.league}','${o.day}','${o.startsAt}','${o.status}','${o.home}','${o.away}',${o.homeScore ?? 0},${o.awayScore ?? 0},'x')`,
    )

  beforeEach(async () => {
    vi.resetModules()
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite
    db = fresh.db as unknown as Db.Database
    state.db = db
    state.offersFor = []
    team('col', 'nhl', 'Colorado Avalanche', 'COL')
    team('ana', 'nhl', 'Anaheim Ducks', 'ANA')
    team('den', 'nba', 'Denver Nuggets', 'DEN')
    team('bos', 'nba', 'Boston Celtics', 'BOS')
    // The last week: COL hot (won by 2s), ANA cold (lost by 2s).
    for (let d = 1; d <= 4; d++) {
      const day = `2026-10-0${d + 3}`
      addGame({
        league: 'nhl',
        day,
        startsAt: `${day}T23:00:00Z`,
        status: 'final',
        home: 'col',
        away: 'ana',
        homeScore: 4,
        awayScore: 2,
      })
      addGame({
        league: 'nba',
        day,
        startsAt: `${day}T23:00:00Z`,
        status: 'final',
        home: 'den',
        away: 'bos',
        homeScore: 110,
        awayScore: 104,
      })
    }
    // Upcoming: the Avs play tomorrow, the NBA game is tonight.
    addGame({
      id: 'avs-next',
      league: 'nhl',
      day: '2026-10-09',
      startsAt: '2026-10-10T02:00:00Z',
      status: 'scheduled',
      home: 'ana',
      away: 'col',
    })
    addGame({
      id: 'nba-tonight',
      league: 'nba',
      day: '2026-10-08',
      startsAt: '2026-10-08T23:30:00Z',
      status: 'scheduled',
      home: 'den',
      away: 'bos',
    })
    ;({ findBets } = await import('@/lib/sharp/onDemand'))
  })

  it("finds the Avs' next game and the side their trend favors", async () => {
    const a = await findBets(env, db, 'u1', { team: 'Avs', count: 3 }, NOW)
    expect(a.reason).toBeNull()
    expect(a.games.map((g) => g.gameId)).toEqual(['avs-next'])
    expect(state.offersFor).toEqual(['avs-next'])
    // COL's form beats ANA's: backing COL leads, made the cheaper way
    // (ANA NO at 49¢ rather than COL YES at 50¢), and only once.
    expect(a.picks[0]).toMatchObject({
      title: 'ANA lose',
      side: 'no',
      price: 0.49,
    })
    expect(a.picks.map((p) => p.title)).not.toContain('COL win')
    expect(a.picks[0].trendChance).toBeGreaterThan(0.6)
    expect(a.picks[0].edge).toBeGreaterThan(0)
    expect(a.picks[0].fair).toBeLessThan(a.picks[0].trendChance)
  })

  it("keeps to tonight's games for a league", async () => {
    const a = await findBets(
      env,
      db,
      'u1',
      { league: 'nba', day: 'today', count: 3 },
      NOW,
    )
    expect(a.games.map((g) => g.gameId)).toEqual(['nba-tonight'])
    expect(a.picks.length).toBeGreaterThan(0)
    const none = await findBets(
      env,
      db,
      'u1',
      { league: 'nhl', day: 'today', count: 3 },
      NOW,
    )
    expect(none).toMatchObject({
      picks: [],
      reason: expect.stringMatching(/No NHL games today/),
    })
  })

  it('says so when it has no game, or too little history', async () => {
    const nobody = await findBets(
      env,
      db,
      'u1',
      { team: 'Leafs', count: 3 },
      NOW,
    )
    expect(nobody.reason).toMatch(/No upcoming game for “Leafs”/)
    sqlite.run("DELETE FROM games WHERE status = 'final'")
    const thin = await findBets(env, db, 'u1', { team: 'Avs', count: 3 }, NOW)
    expect(thin.reason).toMatch(/Not enough recent games/)
  })

  it('surprises with an offer the trends favor', async () => {
    const a = await findBets(
      env,
      db,
      'u1',
      { team: 'Avs', count: 3, surprise: true },
      NOW,
      () => 0.99,
    )
    expect(a.picks).toHaveLength(1)
    expect(a.picks[0].edge).toBeGreaterThan(0)
  })

  describe('college football', () => {
    // Saturday 10 Oct 2026, 9am Eastern.
    const SATURDAY = new Date('2026-10-10T13:00:00Z')

    beforeEach(() => {
      // Three noon games and a 3:30 one; the home sides won by 14s on
      // each of the last three Saturdays, the visitors lost by 14s.
      const kickoffs = [
        [
          'ala',
          'Alabama Crimson Tide',
          'ALA',
          'vandy',
          'Vanderbilt Commodores',
          'VAN',
          '16:00',
        ],
        [
          'osu',
          'Ohio State Buckeyes',
          'OSU',
          'pur',
          'Purdue Boilermakers',
          'PUR',
          '16:00',
        ],
        [
          'clem',
          'Clemson Tigers',
          'CLEM',
          'bc',
          'Boston College Eagles',
          'BC',
          '16:45',
        ],
        [
          'tex',
          'Texas Longhorns',
          'TEX',
          'ku',
          'Kansas Jayhawks',
          'KU',
          '19:30',
        ],
      ]
      for (const [
        home,
        homeName,
        homeAbbr,
        away,
        awayName,
        awayAbbr,
        at,
      ] of kickoffs) {
        team(home, 'cfb', homeName, homeAbbr)
        team(away, 'cfb', awayName, awayAbbr)
        team(`${home}-foe`, 'cfb', `${homeName} Foe`, 'HF')
        team(`${away}-foe`, 'cfb', `${awayName} Foe`, 'AF')
        for (const day of ['2026-09-19', '2026-09-26', '2026-10-03']) {
          addGame({
            league: 'cfb',
            day,
            startsAt: `${day}T19:30:00Z`,
            status: 'final',
            home,
            away: `${home}-foe`,
            homeScore: 35,
            awayScore: 21,
          })
          addGame({
            league: 'cfb',
            day,
            startsAt: `${day}T19:30:00Z`,
            status: 'final',
            home: `${away}-foe`,
            away,
            homeScore: 35,
            awayScore: 21,
          })
        }
        addGame({
          id: `${home}-next`,
          league: 'cfb',
          day: '2026-10-10',
          startsAt: `2026-10-10T${at}:00Z`,
          status: 'scheduled',
          home,
          away,
        })
      }
    })

    it('makes a 3-leg combo from the noon slate', async () => {
      const a = await findBets(
        env,
        db,
        'u1',
        { league: 'cfb', day: 'today', slate: 'noon', count: 3, legs: 3 },
        SATURDAY,
      )
      expect(a.reason).toBeNull()
      expect(a.games.map((g) => g.gameId).sort()).toEqual([
        'ala-next',
        'clem-next',
        'osu-next',
      ])
      expect(state.offersFor.sort()).toEqual([
        'ala-next',
        'clem-next',
        'osu-next',
      ])
      expect(a.combo?.legs).toHaveLength(3)
      expect(a.picks).toEqual(a.combo?.legs)
      // One leg a game, each backing the home side the trends favor.
      expect(new Set(a.picks.map((p) => p.key.gameId)).size).toBe(3)
      expect(a.picks.map((p) => p.title).sort()).toEqual([
        'BC lose',
        'PUR lose',
        'VAN lose',
      ])
      expect(a.combo?.fair).toBeCloseTo(a.picks.reduce((n, p) => n * p.fair, 1))
    })

    it('says so when a slate has too few games for the combo', async () => {
      const a = await findBets(
        env,
        db,
        'u1',
        { league: 'cfb', day: 'today', slate: 'afternoon', count: 3, legs: 3 },
        SATURDAY,
      )
      expect(a).toMatchObject({
        picks: [],
        combo: null,
        reason: expect.stringMatching(/Only one game in the afternoon slate/),
      })
      const late = await findBets(
        env,
        db,
        'u1',
        { league: 'cfb', day: 'today', slate: 'late', count: 3 },
        SATURDAY,
      )
      expect(late.reason).toMatch(
        /No college football games in the late slate today/,
      )
    })
  })

  it("won't suggest a game about to start", async () => {
    const late = new Date('2026-10-08T23:15:00Z')
    const a = await findBets(
      env,
      db,
      'u1',
      { league: 'nba', day: 'today', count: 3 },
      late,
    )
    expect(a.games).toEqual([])
  })
})
