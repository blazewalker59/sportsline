/**
 * Publishing and re-checking a Sharp slate, on the real migrations. Odds,
 * Polymarket, Kalshi and push are stand-ins. Bun only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type { GameRef } from '@/lib/sharp/sources'
import type { KalshiOffer, Quote } from '@/lib/sharp/engine'
import type * as Slate from '@/lib/sharp/slate'
import type * as Sources from '@/lib/sharp/sources'
import type * as KalshiClient from '@/lib/kalshi/client'

const NOW = new Date('2026-10-08T18:00:00.000Z')

const state = vi.hoisted(() => ({
  db: null as unknown,
  account: { keyId: 'svc' } as { keyId: string } | null,
  oddsQuotes: [] as Array<Quote>,
  oddsRemaining: 100 as number | null,
  oddsError: null as Error | null,
  polyQuotes: [] as Array<Quote>,
  polyError: null as Error | null,
  offers: null as Array<KalshiOffer> | null,
  titles: new Map<string, string>(),
  markets: [] as Array<Record<string, string>>,
  pushes: [] as Array<string>,
  oddsCalls: 0,
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))

vi.mock('@/lib/sharp/sources', async (original) => {
  const mod = await original<typeof Sources>()
  return {
    ...mod,
    oddsApiQuotes: () => {
      state.oddsCalls++
      if (state.oddsError) return Promise.reject(state.oddsError)
      return Promise.resolve({
        quotes: state.oddsQuotes,
        remaining: state.oddsRemaining,
      })
    },
    polymarketQuotes: () => {
      if (state.polyError) return Promise.reject(state.polyError)
      return Promise.resolve(state.polyQuotes)
    },
  }
})

vi.mock('@/lib/sharp/kalshi', () => ({
  serviceAccount: () => Promise.resolve(state.account),
  kalshiOffers: (
    _env: unknown,
    _account: unknown,
    _db: unknown,
    refs: Array<GameRef>,
  ) => Promise.resolve(state.offers ?? refs.map(offerFor)),
  titlesForMarkets: () => Promise.resolve(state.titles),
}))

vi.mock('@/lib/kalshi/client', async (original) => {
  const mod = await original<typeof KalshiClient>()
  return {
    ...mod,
    markets: () => Promise.resolve(state.markets),
  }
})

vi.mock('@/lib/push/webpush', () => ({
  sendPush: (_sub: unknown, message: string) => {
    state.pushes.push(message)
    return Promise.resolve('sent')
  },
}))

function offerFor(game: GameRef): KalshiOffer {
  return {
    ticker: `${game.gameId}-ML`,
    key: {
      gameId: game.gameId,
      kind: 'moneyline',
      teamId: game.away.id,
      line: null,
    },
    league: game.league,
    startsAt: game.startsAt,
    side: 'yes',
    price: 0.45,
    bid: 0.44,
    volume: 1_000,
    title: `${game.away.abbreviation} win`,
    gameLabel: `${game.away.abbreviation} @ ${game.home.abbreviation}`,
    gameTitle: `${game.away.name} vs ${game.home.name}`,
  }
}

function quoteFor(gameId: string, teamId: string): Quote {
  return {
    key: { gameId, kind: 'moneyline', teamId, line: null },
    source: 'pinnacle',
    prob: 0.62,
  }
}

describe.skipIf(!isBun)('sharp slate', () => {
  let slate: typeof Slate
  let sqlite: { run: (sql: string) => void }
  let db: Db.Database
  const env = {
    DB: {},
    ODDS_API_KEY: 'odds-key',
    VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_JWK: '{}',
  } as CloudflareEnv

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    vi.stubGlobal('fetch', () =>
      Promise.reject(new Error('unexpected network fetch')),
    )
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite
    db = fresh.db as unknown as Db.Database
    state.db = db
    state.account = { keyId: 'svc' }
    state.oddsQuotes = []
    state.oddsRemaining = 100
    state.oddsError = null
    state.polyQuotes = []
    state.polyError = null
    state.offers = null
    state.titles = new Map()
    state.markets = []
    state.pushes = []
    state.oddsCalls = 0
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
    sqlite.run(
      "INSERT INTO teams (id,league,name,abbreviation) VALUES ('nyy','mlb','New York Yankees','NYY'),('bos','mlb','Boston Red Sox','BOS'),('col','nhl','Colorado Avalanche','COL'),('ana','nhl','Anaheim Ducks','ANA')",
    )
    slate = await import('@/lib/sharp/slate')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const addGame = (id: string, league: string, away: string, home: string) =>
    sqlite.run(
      `INSERT INTO games (id,league,sports_day,starts_at,status,away_team_id,home_team_id,away_score,home_score,updated_at) VALUES ('${id}','${league}','2026-10-08','2026-10-08T23:00:00Z','scheduled','${away}','${home}',0,0,'x')`,
    )

  const picks = () =>
    (
      sqlite as unknown as {
        query: (sql: string) => {
          all: () => Array<Record<string, unknown>>
        }
      }
    )
      .query(
        'SELECT id, kind, rank, grade, title, result, current_price, closing_price, game_title FROM sharp_picks ORDER BY rank',
      )
      .all()

  it('publishes at 10am Eastern and not before', () => {
    expect(slate.publishDue(new Date('2026-10-08T13:59:00.000Z'))).toBe(false)
    expect(slate.publishDue(new Date('2026-10-08T14:00:00.000Z'))).toBe(true)
  })

  it('waits when today has no games or no priced markets, and keeps an existing slate', async () => {
    expect(await slate.publishSlate(env, NOW)).toBe(false)
    addGame('g-final', 'nhl', 'col', 'ana')
    sqlite.run("UPDATE games SET status = 'final' WHERE id = 'g-final'")
    expect(await slate.publishSlate(env, NOW)).toBe(false)
    addGame('g1', 'nhl', 'col', 'ana')
    state.account = null
    await expect(slate.publishSlate(env, NOW)).rejects.toThrow(
      /No admin Kalshi account/,
    )
    state.account = { keyId: 'svc' }
    state.offers = []
    expect(await slate.publishSlate(env, NOW)).toBe(false)
    state.oddsCalls = 0
    sqlite.run(
      "INSERT INTO sharp_picks (id,day,rank,kind,starts_at,title,game_label,fair,price,fee,edge,ev_per_dollar,grade,sources,created_at) VALUES ('2026-10-08:1','2026-10-08',1,'single','2026-10-08T23:00:00Z','kept','COL @ ANA',0.6,0.5,0.02,0.08,0.1,'strong','[]','2026-10-08T14:00:00Z')",
    )
    expect(await slate.publishSlate(env, NOW)).toBe(true)
    expect(state.oddsCalls).toBe(0)
  })

  it('stores singles and a combo, and still publishes when one source fails', async () => {
    addGame('g1', 'nhl', 'col', 'ana')
    addGame('g2', 'mlb', 'nyy', 'bos')
    state.oddsQuotes = [quoteFor('g1', 'col'), quoteFor('g2', 'nyy')]
    state.oddsRemaining = 59
    state.polyError = new Error('polymarket down')
    sqlite.run(
      "INSERT INTO kalshi_accounts (viewer_id,key_id,key_type,key_ciphertext,key_iv,scopes,status,connected_at) VALUES ('u1','k','ed25519','c','i','[]','ok','2026-10-01T00:00:00Z')",
    )
    sqlite.run(
      "INSERT INTO push_subscriptions (endpoint,viewer_id,p256dh,auth,created_at) VALUES ('https://push.example/1','u1','k','a','2026-10-08T00:00:00Z'),('https://push.example/2','u1','k','a','2026-10-08T00:00:00Z')",
    )
    sqlite.run(
      "INSERT INTO alert_settings (viewer_id,predictions) VALUES ('u1','off')",
    )
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u2','W','w@example.com',1,0,0)",
    )
    sqlite.run(
      "INSERT INTO kalshi_accounts (viewer_id,key_id,key_type,key_ciphertext,key_iv,scopes,status,connected_at) VALUES ('u2','k','ed25519','c','i','[]','ok','2026-10-01T00:00:00Z')",
    )
    sqlite.run(
      "INSERT INTO push_subscriptions (endpoint,viewer_id,p256dh,auth,created_at) VALUES ('https://push.example/3','u2','k','a','2026-10-08T00:00:00Z')",
    )
    sqlite.run(
      "INSERT INTO viewer_settings (viewer_id,price_display) VALUES ('u2','multiplier')",
    )
    expect(await slate.publishSlate(env, NOW)).toBe(true)
    const rows = picks()
    expect(rows.map((row) => row.kind)).toEqual(['single', 'single', 'combo'])
    expect(rows[0]).toMatchObject({ rank: 1, grade: 'strong' })
    expect(rows[2]).toMatchObject({ id: '2026-10-08:6', rank: 6 })
    expect(state.pushes).toHaveLength(1)
    const message = JSON.parse(state.pushes[0] ?? '{}') as {
      title: string
      body: string
    }
    expect(message.title).toContain('2 picks + combo')
    expect(message.body).toContain('pts edge')
    const errors = (
      sqlite as unknown as {
        query: (sql: string) => { all: () => Array<{ message: string }> }
      }
    )
      .query('SELECT message FROM error_events ORDER BY message')
      .all()
    expect(errors.map((row) => row.message)).toEqual([
      'Odds API credits running low',
      'polymarket down',
    ])

    const quiet = {
      ...env,
      ODDS_API_KEY: undefined,
      VAPID_PUBLIC_KEY: undefined,
    }
    state.pushes = []
    state.polyError = null
    state.polyQuotes = [quoteFor('g1', 'col'), quoteFor('g2', 'nyy')]
    sqlite.run('DELETE FROM sharp_picks')
    expect(await slate.publishSlate(quiet as CloudflareEnv, NOW)).toBe(true)
    expect(state.oddsCalls).toBe(1)
    expect(state.pushes).toEqual([])
  })

  it('re-checks the price, the close and the result of open picks', async () => {
    const day = '2026-10-08'
    const insert = (id: string, extra: string) =>
      sqlite.run(
        `INSERT INTO sharp_picks (id,day,rank,kind,starts_at,market_ticker,side,title,game_label,fair,price,fee,edge,ev_per_dollar,grade,sources,created_at${extra ? ',' + extra.split('=')[0] : ''}) VALUES ('${id}','${day}',1,'single','2026-10-08T23:00:00Z','TIX','yes','COL win','COL @ ANA',0.62,0.45,0.02,0.15,0.3,'strong','[]','2026-10-08T14:00:00Z'${extra ? ',' + extra.split('=').slice(1).join('=') : ''})`,
      )
    insert('2026-10-08:1', '')
    state.markets = [
      { ticker: 'TIX', yes_bid_dollars: '0.40', yes_ask_dollars: '0.42' },
    ]
    expect(await slate.recheckSlate(env, NOW)).toBe(1)
    expect(picks()[0]).toMatchObject({
      current_price: 0.42,
      closing_price: null,
      result: null,
    })

    state.markets = [
      {
        ticker: 'TIX',
        yes_bid_dollars: '0.50',
        yes_ask_dollars: '0.55',
        result: 'yes',
      },
    ]
    state.titles = new Map([['TIX', 'Colorado vs Anaheim']])
    const later = new Date('2026-10-08T23:30:00.000Z')
    vi.setSystemTime(later)
    expect(await slate.recheckSlate(env, later)).toBe(1)
    expect(picks()[0]).toMatchObject({
      current_price: 0.42,
      closing_price: 0.42,
      result: 'won',
      game_title: 'Colorado vs Anaheim',
    })

    sqlite.run('DELETE FROM sharp_picks')
    sqlite.run(
      `INSERT INTO sharp_picks (id,day,rank,kind,starts_at,title,game_label,fair,price,fee,edge,ev_per_dollar,grade,sources,legs,created_at) VALUES (
        '2026-10-08:6','2026-10-08',6,'combo','2026-10-08T23:00:00Z','2-leg combo','COL @ ANA',0.3,0.2,0.02,0.08,0.3,'strong','[]',
        '[{"marketTicker":"A","side":"yes","title":"A","gameLabel":"A","league":"nhl","startsAt":"2026-10-08T23:00:00Z","fair":0.6,"price":0.4,"currentPrice":null,"closingPrice":null,"result":null},{"marketTicker":"B","side":"no","title":"B","gameLabel":"B","league":"mlb","startsAt":"2026-10-08T23:00:00Z","fair":0.55,"price":0.4,"currentPrice":null,"closingPrice":null,"result":null}]',
        '2026-10-08T14:00:00Z')`,
    )
    state.markets = [
      {
        ticker: 'A',
        yes_bid_dollars: '0.40',
        yes_ask_dollars: '0.50',
        result: 'yes',
      },
      {
        ticker: 'B',
        yes_bid_dollars: '0.30',
        yes_ask_dollars: '0.40',
        result: 'yes',
      },
    ]
    vi.setSystemTime(NOW)
    expect(await slate.recheckSlate(env, NOW)).toBe(1)
    const combo = (
      sqlite as unknown as {
        query: (sql: string) => { get: () => { result: string; legs: string } }
      }
    )
      .query(
        "SELECT result, legs, current_price FROM sharp_picks WHERE id = '2026-10-08:6'",
      )
      .get()
    const legs = JSON.parse(combo.legs) as Array<{ result: string | null }>
    expect(legs.map((leg) => leg.result)).toEqual(['won', 'lost'])
    expect(combo.result).toBe('lost')

    sqlite.run('DELETE FROM sharp_picks')
    expect(await slate.recheckSlate(env, NOW)).toBe(0)
    state.account = null
    insert('2026-10-08:1', '')
    expect(await slate.recheckSlate(env, NOW)).toBe(0)
  })
})
