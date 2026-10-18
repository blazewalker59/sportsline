/**
 * Reaction server functions on the real migrations, through the Start
 * compiler's provider module so the handlers actually run. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import * as caller from '@/lib/reactions/server'
// Handler bodies are extracted here; the plain import only has RPC stubs.
// @ts-expect-error The Start compiler's provider split is a query, not a TS path.
import * as provider from '@/lib/reactions/server?tss-serverfn-split'

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

const fns = provider as unknown as Record<string, ServerFn>

async function call<T>(name: string, data?: unknown) {
  const { serverRequestContext } = await import('@/lib/db')
  return runWithStartContext(
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
        () =>
          fns[`${name}_createServerFn_handler`]({ data }) as Promise<{
            result?: T
            error?: unknown
          }>,
      ),
  )
}

const DAY = '2026-10-17'
const sqlite = () => state.sqlite!
const reactionRows = () =>
  sqlite().query('SELECT item_id, emoji FROM reactions ORDER BY item_id').all()

describe.skipIf(!isBun)('reaction server functions', () => {
  beforeEach(async () => {
    const opened = await sqliteDb()
    state.db = opened.db
    state.sqlite = opened.sqlite
    const s = sqlite()
    s.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
    s.run(
      "INSERT INTO teams (id, league, name, abbreviation) VALUES ('tm_a','nfl','A','A'),('tm_b','nfl','B','B')",
    )
    s.run(
      `INSERT INTO games (id, league, sports_day, starts_at, status, away_team_id, home_team_id, updated_at) VALUES ('gm_1','nfl','${DAY}','${DAY}T17:00:00Z','final','tm_a','tm_b','')`,
    )
    for (const id of ['it_1', 'it_2'])
      s.run(
        `INSERT INTO timeline_items (id, game_id, item_key, league, sports_day, away_team_id, home_team_id, kind, sequence, occurred_at, segment_label, away_score, home_score, description, significance, status, players)
         VALUES ('${id}','gm_1','${id}','nfl','${DAY}','tm_a','tm_b','play',1,'${DAY}T18:00:00Z','Q1',0,0,'x','routine','active','[]')`,
      )
  })

  it('loads the caller wrappers coverage measures', () => {
    expect(typeof caller.setReaction).toBe('function')
  })

  it("refuses a Reaction to an item that isn't on the Timeline", async () => {
    const r = await call('setReaction', { itemId: 'nope', emoji: '🔥' })
    expect(String(r.error)).toContain('No such Play')
    expect(reactionRows()).toEqual([])
  })

  it('reacts, replaces and clears', async () => {
    await call('setReaction', { itemId: 'it_1', emoji: '🔥' })
    await call('setReaction', { itemId: 'it_1', emoji: '🐐' })
    expect(reactionRows()).toEqual([{ item_id: 'it_1', emoji: '🐐' }])
    await call('setReaction', { itemId: 'it_1', emoji: null })
    expect(reactionRows()).toEqual([])
  })

  it("goes when its Play is removed, and stays when another's is", async () => {
    sqlite().run('PRAGMA foreign_keys = ON') // As D1 always has it.
    await call('setReaction', { itemId: 'it_1', emoji: '🔥' })
    await call('setReaction', { itemId: 'it_2', emoji: '😱' })
    sqlite().run("DELETE FROM timeline_items WHERE id = 'it_1'")
    expect(reactionRows()).toEqual([{ item_id: 'it_2', emoji: '😱' }])
  })

  it("reads the Viewer's Reactions newest first by index", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-17T19:00:00Z'))
    await call('setReaction', { itemId: 'it_1', emoji: '🔥' })
    vi.setSystemTime(new Date('2026-10-17T19:05:00Z'))
    await call('setReaction', { itemId: 'it_2', emoji: '😱' })
    vi.useRealTimers()
    const mine = await call<{
      reactions: Array<{ item: { id: string } }>
    }>('getMyReactions', {})
    expect(mine.result?.reactions.map((r) => r.item.id)).toEqual([
      'it_2',
      'it_1',
    ])
    const plan = sqlite()
      .query(
        "EXPLAIN QUERY PLAN SELECT * FROM reactions WHERE viewer_id = 'u1' ORDER BY created_at DESC",
      )
      .all()
      .map((r) => String(r.detail))
      .join('\n')
    expect(plan).toContain('reactions_viewer_time_idx')
  })
})
