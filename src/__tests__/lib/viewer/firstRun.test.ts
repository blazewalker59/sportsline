/**
 * The first-run Follow picker's server side on the real migrations: the
 * "done" flag in viewer_settings, what sets it, the Teams it offers, and
 * the migration's backfill for Viewers who already follow something.
 * Bun only.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import * as caller from '@/lib/viewer/server'
// Handler bodies are extracted here; the plain import only has RPC stubs.
// @ts-expect-error The Start compiler's provider split is a query, not a TS path.
import * as provider from '@/lib/viewer/server?tss-serverfn-split'

type Sqlite = Awaited<ReturnType<typeof sqliteDb>>['sqlite']
type AppDb = Awaited<ReturnType<typeof sqliteDb>>['db']
type ServerFn = (opts: {
  data?: unknown
}) => Promise<{ result?: unknown; error?: unknown }>

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

// Opening the app starts the Viewer's sync Durable Object; not here.
vi.mock('@/lib/live/startViewerSync', () => ({
  startViewerSync: () => Promise.resolve(),
}))

const fns = provider as unknown as Record<string, ServerFn>

async function call(name: string, data?: unknown): Promise<unknown> {
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
  return r.result
}

const doneAt = () =>
  (
    state
      .sqlite!.query(
        "SELECT first_run_done_at AS at FROM viewer_settings WHERE viewer_id = 'u1'",
      )
      .get() as { at: string | null } | null
  )?.at ?? null

const firstRunDone = async () =>
  ((await call('getViewerState')) as caller.ViewerState).firstRunDone

describe.skipIf(!isBun)('the first-run Follow picker', () => {
  beforeEach(async () => {
    const opened = await sqliteDb()
    state.db = opened.db
    state.sqlite = opened.sqlite
    state.sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
    state.sqlite.run(
      `INSERT INTO teams (id, league, name, abbreviation, logo_url) VALUES
        ('nfl-kc', 'nfl', 'Kansas City Chiefs', 'KC', null),
        ('nfl-buf', 'nfl', 'Buffalo Bills', 'BUF', 'https://x/buf.png'),
        ('nba-bos', 'nba', 'Boston Celtics', 'BOS', null),
        ('mlb-nyy', 'mlb', 'New York Yankees', 'NYY', null)`,
    )
  })

  it('loads the caller wrappers coverage measures', () => {
    expect(typeof caller.dismissFirstRun).toBe('function')
    expect(typeof caller.leagueFollowables).toBe('function')
  })

  it('is offered to a new Viewer', async () => {
    expect(await firstRunDone()).toBe(false)
  })

  it('is put behind them when skipped, keeping their other settings', async () => {
    state.sqlite!.run(
      "INSERT INTO viewer_settings (viewer_id, price_display) VALUES ('u1', 'multiplier')",
    )
    await call('dismissFirstRun')
    expect(doneAt()).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(await firstRunDone()).toBe(true)
    const row = state
      .sqlite!.query(
        "SELECT price_display FROM viewer_settings WHERE viewer_id = 'u1'",
      )
      .get() as { price_display: string }
    expect(row.price_display).toBe('multiplier')
  })

  it('keeps the first time it was put behind them', async () => {
    await call('dismissFirstRun')
    const first = doneAt()
    state.sqlite!.run(
      "UPDATE viewer_settings SET first_run_done_at = '2026-01-01T00:00:00.000Z'",
    )
    await call('dismissFirstRun')
    expect(first).not.toBeNull()
    expect(doneAt()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('is put behind them by their first Follow, and stays so after unfollowing', async () => {
    await call('setFollow', { kind: 'team', target: 'nfl-kc', following: true })
    expect(await firstRunDone()).toBe(true)
    await call('setFollow', {
      kind: 'team',
      target: 'nfl-kc',
      following: false,
    })
    const after = (await call('getViewerState')) as caller.ViewerState
    expect(after.follows).toEqual([])
    expect(after.firstRunDone).toBe(true)
  })

  it('offers every Team in the picked Leagues, by name', async () => {
    const teams = (await call('leagueFollowables', {
      leagues: ['nfl', 'nba'],
    })) as Array<caller.FollowEntry>
    expect(teams.map((t) => t.label)).toEqual([
      'Boston Celtics',
      'Buffalo Bills',
      'Kansas City Chiefs',
    ])
    expect(teams[1]).toEqual({
      follow: { kind: 'team', teamId: 'nfl-buf' },
      label: 'Buffalo Bills',
      detail: 'BUF',
      league: 'nfl',
      logoUrl: 'https://x/buf.png',
    })
  })

  it('refuses an unknown League', async () => {
    await expect(
      call('leagueFollowables', { leagues: ['xfl'] }),
    ).rejects.toThrow()
    await expect(call('leagueFollowables', { leagues: [] })).rejects.toThrow()
  })

  it('migrates Viewers who already follow something as past it', () => {
    state.sqlite!.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u2','W','w@example.com',1,0,0), ('u3','X','x@example.com',1,0,0)",
    )
    state.sqlite!.run(
      `INSERT INTO follows (viewer_id, kind, target, created_at) VALUES
        ('u1', 'team', 'nfl-kc', ''), ('u1', 'league', 'nba', ''),
        ('u2', 'league', 'nfl', '')`,
    )
    // u2 already has settings (a price display) to keep.
    state.sqlite!.run(
      "INSERT INTO viewer_settings (viewer_id, price_display) VALUES ('u2', 'multiplier')",
    )
    const migration = readFileSync(
      join(process.cwd(), 'drizzle/0034_first_run.sql'),
      'utf8',
    )
    const backfill = migration.split('--> statement-breakpoint')[1]
    state.sqlite!.run(backfill)
    const rows = state
      .sqlite!.query(
        'SELECT viewer_id, price_display, first_run_done_at FROM viewer_settings ORDER BY viewer_id',
      )
      .all() as Array<{
      viewer_id: string
      price_display: string
      first_run_done_at: string | null
    }>
    expect(rows.map((r) => [r.viewer_id, r.price_display])).toEqual([
      ['u1', 'cents'],
      ['u2', 'multiplier'],
    ])
    expect(rows.every((r) => r.first_run_done_at)).toBe(true)
  })
})
