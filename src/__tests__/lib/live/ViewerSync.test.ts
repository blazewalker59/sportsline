/**
 * One Viewer's sync loop: which tasks run, how a failure backs off, and
 * when an idle task leaves the health page. Bun only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryCtx } from '../../helpers/durable'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { MemoryCtx } from '../../helpers/durable'
import type { ViewerSync as ViewerSyncClass } from '@/lib/live/ViewerSync'

const NOW = Date.parse('2026-10-08T18:00:00.000Z')
const MINUTE = 60_000

const state = vi.hoisted(() => ({
  db: null as unknown,
  calls: [] as Array<string>,
  fail: '' as string,
}))

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: unknown
    env: unknown
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx
      this.env = env
    }
  },
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))

vi.mock('@/lib/ops/errors', () => ({
  reportError: () => Promise.resolve(),
}))

vi.mock('@/lib/kalshi/sync', () => ({
  refreshPrices: () => {
    state.calls.push('prices')
    if (state.fail === 'prices') return Promise.reject(new Error('prices'))
    return Promise.resolve()
  },
  syncAccount: () => {
    state.calls.push('positions')
    if (state.fail === 'positions')
      return Promise.reject(new Error('positions'))
    return Promise.resolve({ open: 0, settled: 0 })
  },
}))

vi.mock('@/lib/fantasy/sync', () => ({
  syncAccount: () => {
    state.calls.push('espn')
    if (state.fail === 'espn') return Promise.reject(new Error('espn'))
    return Promise.resolve(1)
  },
}))

vi.mock('@/lib/fantasy/sleeper/sync', () => ({
  syncAccount: () => {
    state.calls.push('sleeper')
    return Promise.resolve(1)
  },
}))

vi.mock('@/lib/push/predictionAlerts', () => ({
  sendPredictionAlerts: () => {
    state.calls.push('alerts')
    return Promise.resolve()
  },
}))

describe.skipIf(!isBun)('ViewerSync', () => {
  let ViewerSync: typeof ViewerSyncClass
  let ctx: MemoryCtx
  let sqlite: { run: (sql: string) => void }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    vi.stubGlobal('fetch', () =>
      Promise.reject(new Error('unexpected network fetch')),
    )
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite
    state.db = fresh.db
    state.calls = []
    state.fail = ''
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
    ctx = memoryCtx()
    ;({ ViewerSync } = await import('@/lib/live/ViewerSync'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function sync() {
    return new ViewerSync(ctx as never, { DB: {} } as never)
  }

  const jobNames = () =>
    (
      sqlite as unknown as {
        query: (sql: string) => { all: () => Array<{ name: string }> }
      }
    )
      .query('SELECT name FROM job_runs ORDER BY name')
      .all()
      .map((row) => row.name)

  it('does nothing until a Viewer is stored', async () => {
    await sync().alarm()
    expect(state.calls).toEqual([])
    expect(ctx.alarmSets).toEqual([])
  })

  it('remembers the Viewer and starts once', async () => {
    const loop = sync()
    await loop.start('u1')
    expect(await ctx.storage.get('viewerId')).toBe('u1')
    const alarm = await ctx.storage.getAlarm()
    vi.setSystemTime(NOW + 5_000)
    await loop.start('u1')
    expect(await ctx.storage.getAlarm()).toBe(alarm)
    await loop.start('u2')
    expect(await ctx.storage.get('viewerId')).toBe('u2')
  })

  it('runs price alerts only while a Prediction is open, and positions whenever Kalshi is connected', async () => {
    sqlite.run(
      "INSERT INTO kalshi_accounts (viewer_id,key_id,key_type,key_ciphertext,key_iv,scopes,status,connected_at) VALUES ('u1','k','ed25519','c','i','[]','ok','2026-10-01T00:00:00Z')",
    )
    const loop = sync()
    await loop.start('u1')
    ctx.alarmSets.length = 0
    await loop.alarm()
    expect(state.calls).toEqual(['positions'])
    sqlite.run(
      "INSERT INTO predictions (id,viewer_id,market_ticker,kind,side,title,contracts,cost,status,opened_at,updated_at) VALUES ('p1','u1','T','single','yes','T',1,0.5,'open','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z')",
    )
    await loop.syncNow('u1')
    expect(await ctx.storage.get('tasks')).toBeUndefined()
    state.calls = []
    await loop.alarm()
    expect(state.calls).toEqual(['prices', 'alerts', 'positions'])
  })

  it('backs off a failing ESPN sync, then returns to its interval', async () => {
    sqlite.run(
      "INSERT INTO espn_accounts (viewer_id,swid_ciphertext,swid_iv,s2_ciphertext,s2_iv,status,connected_at) VALUES ('u1','s','i','s2','i','ok','2026-10-01T00:00:00Z')",
    )
    const loop = sync()
    await loop.start('u1')
    state.fail = 'espn'
    await loop.alarm()
    expect(state.calls).toEqual(['espn'])
    state.calls = []
    vi.setSystemTime(NOW + 4 * MINUTE - 1)
    await loop.alarm()
    expect(state.calls).toEqual([])
    vi.setSystemTime(NOW + 4 * MINUTE)
    await loop.alarm()
    expect(state.calls).toEqual(['espn'])
    state.fail = ''
    state.calls = []
    vi.setSystemTime(NOW + 4 * MINUTE + 8 * MINUTE)
    await loop.alarm()
    expect(state.calls).toEqual(['espn'])
    const tasks = await ctx.storage.get<{
      espn: { dueAt: number; failures: number }
    }>('tasks')
    expect(tasks?.espn.failures).toBe(0)
    expect(tasks?.espn.dueAt).toBe(NOW + 12 * MINUTE + 2 * MINUTE)
  })

  it('waits at least five seconds, and looks for new Predictions within five minutes', async () => {
    sqlite.run(
      "INSERT INTO kalshi_accounts (viewer_id,key_id,key_type,key_ciphertext,key_iv,scopes,status,connected_at) VALUES ('u1','k','ed25519','c','i','[]','ok','2026-10-01T00:00:00Z')",
    )
    const loop = sync()
    await loop.start('u1')
    await ctx.storage.put('tasks', {
      kalshiPositions: { dueAt: NOW + 1_000, failures: 0 },
    })
    ctx.alarmSets.length = 0
    await loop.alarm()
    expect(state.calls).toEqual([])
    expect(ctx.alarmSets.at(-1)).toBe(NOW + 5_000)

    await ctx.storage.put('tasks', {
      kalshiPositions: { dueAt: NOW + 10 * MINUTE, failures: 0 },
    })
    ctx.alarmSets.length = 0
    await loop.alarm()
    expect(ctx.alarmSets.at(-1)).toBe(NOW + 5 * MINUTE)
  })

  it('drops a paused task from the health page and stops with nothing connected', async () => {
    sqlite.run(
      "INSERT INTO espn_accounts (viewer_id,swid_ciphertext,swid_iv,s2_ciphertext,s2_iv,status,connected_at) VALUES ('u1','s','i','s2','i','ok','2026-10-01T00:00:00Z')",
    )
    sqlite.run(
      "INSERT INTO sleeper_accounts (viewer_id,username,user_id,status,connected_at) VALUES ('u1','name','sid','ok','2026-10-01T00:00:00Z')",
    )
    const loop = sync()
    await loop.start('u1')
    await loop.alarm()
    expect(state.calls.sort()).toEqual(['espn', 'sleeper'])
    expect(jobNames()).toEqual(['espn:u1', 'sleeper:u1'])
    sqlite.run('DELETE FROM espn_accounts')
    sqlite.run('DELETE FROM sleeper_accounts')
    state.calls = []
    ctx.alarmSets.length = 0
    await loop.alarm()
    expect(state.calls).toEqual([])
    expect(jobNames()).toEqual([])
    expect(ctx.alarmSets).toEqual([])
  })
})
