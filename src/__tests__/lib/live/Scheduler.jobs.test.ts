/**
 * Scheduler job order, daily backoff and the morning slate, on the real
 * migrations. Each job's work is a stand-in; runJob and staleness are real.
 * Bun only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryCtx } from '../../helpers/durable'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { MemoryCtx } from '../../helpers/durable'
import type { Scheduler as SchedulerClass } from '@/lib/live/Scheduler'
import type * as Slate from '@/lib/sharp/slate'

const TEN_AM_ET = Date.parse('2026-10-08T14:00:00.000Z')
const NINE_AM_ET = Date.parse('2026-10-08T13:00:00.000Z')
const MINUTE = 60_000

const state = vi.hoisted(() => ({
  db: null as unknown,
  order: [] as Array<string>,
  rosterOk: true,
  schedulesThrow: false,
  trimThrow: false,
  slate: true as boolean | 'throw',
  errors: [] as Array<{ scope: string; message: string; job?: unknown }>,
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
  reportError: (
    _env: unknown,
    scope: string,
    error: unknown,
    context?: { job?: unknown },
  ) => {
    state.errors.push({
      scope,
      message: error instanceof Error ? error.message : String(error),
      job: context?.job,
    })
    return Promise.resolve()
  },
}))

vi.mock('@/lib/live/schedule', () => ({
  syncSchedules: () => {
    state.order.push('schedules')
    if (state.schedulesThrow) return Promise.reject(new Error('schedule down'))
    return Promise.resolve()
  },
}))

vi.mock('@/lib/live/roster', () => ({
  syncRoster: (_env: unknown, league: string) => {
    state.order.push(`roster:${league}`)
    return Promise.resolve(state.rosterOk)
  },
}))

vi.mock('@/lib/live/retention', () => ({
  trimRoutinePlays: () => {
    state.order.push('retention')
    if (state.trimThrow) return Promise.reject(new Error('trim down'))
    return Promise.resolve(0)
  },
}))

vi.mock('@/lib/kalshi/sync', () => ({
  pruneHistory: () => {
    state.order.push('prune')
    return Promise.resolve()
  },
}))

vi.mock('@/lib/sharp/slate', async (original) => {
  const mod = await original<typeof Slate>()
  return {
    ...mod,
    publishSlate: () => {
      state.order.push('sharp-slate')
      if (state.slate === 'throw')
        return Promise.reject(new Error('slate down'))
      return Promise.resolve(state.slate)
    },
    recheckSlate: () => {
      state.order.push('sharp-recheck')
      return Promise.resolve(0)
    },
  }
})

vi.mock('@/lib/sharp/trendRecord', () => ({
  trackTrendPicks: () => {
    state.order.push('trend-picks')
    return Promise.resolve()
  },
}))

vi.mock('@/lib/live/startViewerSync', () => ({
  startViewerSync: (_env: unknown, viewerId: string) => {
    state.order.push(`sweep:${viewerId}`)
    return Promise.resolve()
  },
}))

describe.skipIf(!isBun)('Scheduler jobs', () => {
  let Scheduler: typeof SchedulerClass
  let ctx: MemoryCtx
  let sqlite: { run: (sql: string) => void }
  const env = {
    DB: {},
    VIEWER_SYNC: {
      idFromName: (id: string) => id,
      get: () => ({ start: () => Promise.resolve() }),
    },
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TEN_AM_ET)
    vi.stubGlobal('fetch', () =>
      Promise.reject(new Error('unexpected network fetch')),
    )
    const fresh = await sqliteDb()
    sqlite = fresh.sqlite
    state.db = fresh.db
    state.order = []
    state.rosterOk = true
    state.schedulesThrow = false
    state.trimThrow = false
    state.slate = true
    state.errors = []
    ctx = memoryCtx()
    ;({ Scheduler } = await import('@/lib/live/Scheduler'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function scheduler() {
    return new Scheduler(ctx as never, env as never)
  }

  const jobs = () =>
    (
      sqlite as unknown as {
        query: (sql: string) => { all: () => Array<{ name: string }> }
      }
    )
      .query('SELECT name FROM job_runs ORDER BY rowid')
      .all()
      .map((row) => row.name)

  it('starts the loop once', async () => {
    const loop = scheduler()
    await loop.ensureRunning()
    expect(await ctx.storage.getAlarm()).toBe(TEN_AM_ET)
    vi.setSystemTime(TEN_AM_ET + 5_000)
    await loop.ensureRunning()
    expect(await ctx.storage.getAlarm()).toBe(TEN_AM_ET)
  })

  it('runs schedules before rosters, then the daily jobs, and reschedules first', async () => {
    const loop = scheduler()
    await loop.alarm()
    expect(ctx.alarmSets[0]).toBe(TEN_AM_ET + MINUTE)
    expect(state.order).toEqual([
      'schedules',
      'roster:mlb',
      'roster:nba',
      'roster:nfl',
      'roster:cfb',
      'roster:nhl',
      'retention',
      'prune',
      'sharp-slate',
      'sharp-recheck',
      'trend-picks',
    ])
    expect(jobs()).toEqual([
      'schedules',
      'roster:mlb',
      'roster:nba',
      'roster:nfl',
      'roster:cfb',
      'roster:nhl',
      'retention',
      'sharp-slate',
      'sharp-recheck',
      'trend-picks',
      'sweep',
      'stale-check',
    ])
    state.order = []
    await loop.alarm()
    // Schedules every minute. The daily jobs wait out their interval.
    expect(state.order).toEqual(['schedules'])
  })

  it('keeps going when one job fails, and retries that job after 15 minutes', async () => {
    state.schedulesThrow = true
    state.rosterOk = false
    state.trimThrow = true
    const loop = scheduler()
    await loop.alarm()
    expect(state.order).toContain('sharp-recheck')
    expect(state.order).not.toContain('prune')
    expect(state.errors.map((error) => error.scope)).toEqual([
      'job:schedules',
      'job:roster',
      'job:roster',
      'job:roster',
      'job:roster',
      'job:roster',
      'job:retention',
    ])
    state.schedulesThrow = false
    state.rosterOk = true
    state.trimThrow = false
    state.order = []
    vi.setSystemTime(TEN_AM_ET + 14 * MINUTE)
    await loop.alarm()
    expect(state.order.filter((name) => name.startsWith('roster'))).toEqual([])
    vi.setSystemTime(TEN_AM_ET + 15 * MINUTE)
    state.order = []
    await loop.alarm()
    expect(state.order).toContain('roster:mlb')
    expect(state.order).toContain('retention')
    expect(state.order).toContain('prune')
  })

  it('holds the morning slate until 10am Eastern, then once it publishes', async () => {
    vi.setSystemTime(NINE_AM_ET)
    const loop = scheduler()
    await loop.alarm()
    expect(state.order).not.toContain('sharp-slate')
    vi.setSystemTime(TEN_AM_ET)
    await loop.alarm()
    expect(state.order.filter((name) => name === 'sharp-slate')).toEqual([
      'sharp-slate',
    ])
    state.order = []
    vi.setSystemTime(TEN_AM_ET + 2 * 60 * MINUTE)
    await loop.alarm()
    expect(state.order).not.toContain('sharp-slate')
  })

  it('retries an empty slate hourly, three times, and a failed slate in 15 minutes', async () => {
    state.slate = false
    const loop = scheduler()
    await loop.alarm()
    expect(state.order.filter((name) => name === 'sharp-slate')).toHaveLength(1)
    vi.setSystemTime(TEN_AM_ET + 59 * MINUTE)
    state.order = []
    await loop.alarm()
    expect(state.order).not.toContain('sharp-slate')
    vi.setSystemTime(TEN_AM_ET + 60 * MINUTE)
    await loop.alarm()
    vi.setSystemTime(TEN_AM_ET + 120 * MINUTE)
    await loop.alarm()
    expect(state.order.filter((name) => name === 'sharp-slate')).toHaveLength(2)
    state.order = []
    vi.setSystemTime(TEN_AM_ET + 180 * MINUTE)
    await loop.alarm()
    expect(state.order).not.toContain('sharp-slate')

    vi.setSystemTime(TEN_AM_ET + 24 * 60 * MINUTE)
    state.slate = 'throw'
    state.order = []
    const fresh = memoryCtx()
    const again = new Scheduler(fresh as never, env as never)
    await again.alarm()
    expect(state.order.filter((name) => name === 'sharp-slate')).toHaveLength(1)
    state.order = []
    vi.setSystemTime(TEN_AM_ET + 24 * 60 * MINUTE + 14 * MINUTE)
    await again.alarm()
    expect(state.order).not.toContain('sharp-slate')
    vi.setSystemTime(TEN_AM_ET + 24 * 60 * MINUTE + 15 * MINUTE)
    await again.alarm()
    expect(state.order).toContain('sharp-slate')
  })

  it('sweeps each connected Viewer once and reports stale jobs', async () => {
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0),('u2','W','w@example.com',1,0,0)",
    )
    sqlite.run(
      "INSERT INTO kalshi_accounts (viewer_id,key_id,key_type,key_ciphertext,key_iv,scopes,status,connected_at) VALUES ('u1','k','ed25519','c','i','[]','ok','2026-10-01T00:00:00Z')",
    )
    sqlite.run(
      "INSERT INTO espn_accounts (viewer_id,swid_ciphertext,swid_iv,s2_ciphertext,s2_iv,status,connected_at) VALUES ('u1','s','i','s2','i','ok','2026-10-01T00:00:00Z')",
    )
    sqlite.run(
      "INSERT INTO sleeper_accounts (viewer_id,username,user_id,status,connected_at) VALUES ('u2','sleeper','s2','ok','2026-10-01T00:00:00Z')",
    )
    sqlite.run(
      "INSERT INTO job_runs (name,every_ms,last_ok_at,last_started_at,runs,failures) VALUES ('kalshiPrices:u1',60000,'2026-10-07T00:00:00Z','2026-10-07T00:00:00Z',1,0),('fresh',600000,'2026-10-08T13:59:00Z','2026-10-08T13:59:00Z',1,0)",
    )
    const loop = scheduler()
    await loop.alarm()
    expect(
      state.order.filter((name) => name.startsWith('sweep:')).sort(),
    ).toEqual(['sweep:u1', 'sweep:u2'])
    const stale = state.errors.filter((error) => error.scope === 'stale')
    expect(stale.map((error) => error.job)).toEqual(['kalshiPrices:u1'])
    expect(stale[0]?.message).toContain("hasn't worked recently")
  })
})
