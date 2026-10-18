/**
 * Timeline server functions on the real migrations, through the Start
 * compiler's provider module so the handlers actually run. The Sources'
 * schedules are stand-ins. Bun only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type { TimelinePage } from '@/lib/timeline/server'
import * as caller from '@/lib/timeline/server'
// Handler bodies are extracted here; the plain import only has RPC stubs.
// @ts-expect-error The Start compiler's provider split is a query, not a TS path.
import * as provider from '@/lib/timeline/server?tss-serverfn-split'
import { ACTIVE_LEAGUES } from '@/lib/sources'

type Sqlite = Awaited<ReturnType<typeof sqliteDb>>['sqlite']
type AppDb = Awaited<ReturnType<typeof sqliteDb>>['db']
type ServerFn = (opts: { data?: unknown }) => Promise<{
  result?: unknown
  error?: unknown
}>

const state = vi.hoisted(() => ({
  db: null as AppDb | null,
  sqlite: null as Sqlite | null,
  env: { DB: {} } as unknown as CloudflareEnv,
  synced: [] as Array<string>,
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
  getDb: () => state.db,
  getCloudflareEnv: () => state.env,
}))

vi.mock('@/lib/auth/server', () => ({
  getAuth: () => ({
    api: {
      getSession: () =>
        Promise.resolve({
          user: { id: 'u1', name: 'Viewer', email: 'v@example.com' },
        }),
    },
  }),
}))

vi.mock('@/lib/live/schedule', () => ({
  syncLeague: (_env: unknown, league: string) => {
    state.synced.push(league)
    return Promise.resolve()
  },
}))

const fns = provider as unknown as Record<string, ServerFn>

async function call<T>(name: string, data?: unknown) {
  const { serverRequestContext } = await import('@/lib/db')
  const r = await runWithStartContext(
    {
      getRouter: () => ({}) as never,
      request: new Request('https://sportsline.dev/'),
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: 'serverFn',
    },
    () =>
      serverRequestContext.run(
        { headers: new Headers({ cookie: 'session' }), env: state.env },
        () => fns[`${name}_createServerFn_handler`]({ data }),
      ),
  )
  if (r.error) throw r.error
  return r.result as T
}

const DAY = '2026-10-17'

describe.skipIf(!isBun)('timeline server functions', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-17T22:00:00Z'))
    const opened = await sqliteDb()
    state.db = opened.db
    state.sqlite = opened.sqlite
    state.synced = []
    const s = opened.sqlite
    s.run(
      "INSERT INTO teams (id, league, name, abbreviation) VALUES ('tm_a','nfl','A','A'),('tm_b','nfl','B','B')",
    )
    s.run(
      `INSERT INTO games (id, league, sports_day, starts_at, status, away_team_id, home_team_id, updated_at) VALUES ('gm_1','nfl','${DAY}','${DAY}T17:00:00Z','final','tm_a','tm_b','')`,
    )
    s.run(
      `INSERT INTO timeline_items (id, game_id, item_key, league, sports_day, away_team_id, home_team_id, kind, sequence, occurred_at, segment_label, away_score, home_score, description, significance, status, players)
       VALUES ('it_1','gm_1','k','nfl','${DAY}','tm_a','tm_b','play',1,'${DAY}T18:00:00Z','Q1',0,0,'x','routine','active','[]')`,
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the caller wrappers coverage measures', () => {
    expect(typeof caller.getTimeline).toBe('function')
    expect(typeof caller.ensureSportsDay).toBe('function')
  })

  it('reads a Timeline for hundreds of followed Teams', async () => {
    const follows = [
      ...Array.from({ length: 400 }, (_, i) => `team:tm_x${i}`),
      'team:tm_b',
    ].join(',')
    const page = await call<TimelinePage>('getTimeline', {
      sportsDay: DAY,
      follows,
      includeRoutine: true,
    })
    expect(page.items.map((i) => i.id)).toEqual(['it_1'])
  })

  it('reads nothing for Follows that cover nothing', async () => {
    const page = await call<TimelinePage>('getTimeline', {
      sportsDay: DAY,
      follows: 'junk',
    })
    expect(page.items).toEqual([])
  })

  it('syncs an empty past day once', async () => {
    const day = '2026-10-10'
    expect(await call('ensureSportsDay', { sportsDay: day })).toEqual({
      games: 0,
      loading: false,
    })
    expect(state.synced).toEqual(ACTIVE_LEAGUES)
    await call('ensureSportsDay', { sportsDay: day })
    expect(state.synced).toEqual(ACTIVE_LEAGUES)
  })
})
