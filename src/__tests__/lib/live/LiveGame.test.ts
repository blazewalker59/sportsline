/**
 * LiveGame polling and diffing, on the real migrations. The Source, the
 * hub and push delivery are stand-ins; D1 is Bun's SQLite. Bun only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryCtx } from '../../helpers/durable'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { MemoryCtx } from '../../helpers/durable'
import type {
  LiveGame as LiveGameClass,
  TrackRequest,
} from '@/lib/live/LiveGame'
import type { GameSnapshot, SourceItem } from '@/lib/model/types'
import type * as Deliver from '@/lib/push/deliver'
import { timelineItems } from '@/lib/db/schema'

const NOW = Date.parse('2026-10-08T18:00:00.000Z')

const state = vi.hoisted(() => ({
  db: null as unknown,
  snap: null as GameSnapshot | null,
  snapError: null as Error | null,
  snapCalls: 0,
  /** While set, a snapshot waits on it (a slow Source). */
  gate: null as Promise<void> | null,
  events: [] as Array<Array<{ type: string }>>,
  hubThrows: false,
  hubHangs: false,
  reports: [] as Array<string>,
  /** Whether each report would push the admins. */
  notified: [] as Array<boolean>,
  alertBatches: 0,
  allowLog: [] as Array<boolean>,
  extraAllows: 0,
  extraFinal: false,
  deliverThrows: false,
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

vi.mock('@/lib/sources', () => ({
  sourceFor: () => ({
    source: 'mlb-statsapi',
    snapshot: async () => {
      state.snapCalls++
      if (state.gate) await state.gate
      if (state.snapError) throw state.snapError
      return state.snap
    },
  }),
}))

vi.mock('@/lib/ops/errors', () => ({
  reportError: (
    _env: unknown,
    scope: string,
    _error: unknown,
    _context: unknown,
    options?: { notify?: boolean },
  ) => {
    state.reports.push(scope)
    state.notified.push(options?.notify ?? true)
    return Promise.resolve()
  },
}))

vi.mock('@/lib/push/deliver', async (original) => {
  const mod = await original<typeof Deliver>()
  return {
    ...mod,
    deliverAlerts: async (
      _db: unknown,
      _keys: unknown,
      items: Array<{ kind: string }>,
      allow: (viewerId: string, final: boolean) => Promise<boolean>,
    ) => {
      if (state.deliverThrows) throw new Error('push down')
      state.alertBatches++
      const final = items.some((item) => item.kind === 'milestone')
      state.allowLog.push(await allow('viewer-1', final))
      for (let i = 0; i < state.extraAllows; i++)
        state.allowLog.push(await allow('viewer-1', state.extraFinal))
      return { sent: 1, pruned: 0 }
    },
  }
})

const tracked: TrackRequest = {
  gameId: 'gm_1',
  league: 'mlb',
  sourceGameId: 'src-1',
  sportsDay: '2026-10-08',
  awayTeam: {
    id: 'tm_away',
    abbreviation: 'NYY',
    logoUrl: null,
    name: 'New York Yankees',
  },
  homeTeam: {
    id: 'tm_home',
    abbreviation: 'BOS',
    logoUrl: null,
    name: 'Boston Red Sox',
  },
}

function play(
  key: string,
  overrides: Record<string, unknown> = {},
): SourceItem {
  return {
    kind: 'play',
    key,
    sequence: 1,
    occurredAt: '2026-10-08T17:00:00.000Z',
    segmentLabel: 'Top 1st',
    score: { away: 0, home: 0 },
    description: 'Groundout',
    playType: 'field_out',
    significance: 'routine',
    side: 'away',
    involved: [],
    credits: [],
    detail: null,
    ...overrides,
  } as SourceItem
}

function snap(
  items: Array<SourceItem>,
  overrides: Partial<GameSnapshot> = {},
): GameSnapshot {
  return {
    league: 'mlb',
    sourceGameId: 'src-1',
    status: 'live',
    startsAt: '2026-10-08T17:00:00.000Z',
    sportsDay: '2026-10-08',
    away: {
      sourceId: 'nyy',
      name: 'New York Yankees',
      abbreviation: 'NYY',
      logoUrl: null,
    },
    home: {
      sourceId: 'bos',
      name: 'Boston Red Sox',
      abbreviation: 'BOS',
      logoUrl: null,
    },
    score: { away: 1, home: 0 },
    situation: { segmentLabel: 'Top 1st', detail: null },
    items,
    box: null,
    ...overrides,
  }
}

describe.skipIf(!isBun)('LiveGame', () => {
  let LiveGame: typeof LiveGameClass
  let ctx: MemoryCtx
  let sqlite: {
    run: (sql: string) => void
    query: (sql: string) => { all: () => Array<Record<string, unknown>> }
  }
  let db: Db.Database
  let env: {
    DB: object
    VAPID_PUBLIC_KEY?: string
    VAPID_PRIVATE_JWK?: string
    LIVE_HUB: {
      idFromName: (name: string) => string
      get: (id: string) => {
        publish: (events: Array<{ type: string }>) => Promise<void>
      }
    }
  }

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
    state.snap = null
    state.snapError = null
    state.snapCalls = 0
    state.gate = null
    state.events = []
    state.hubThrows = false
    state.hubHangs = false
    state.reports = []
    state.notified = []
    state.alertBatches = 0
    state.allowLog = []
    state.extraAllows = 0
    state.extraFinal = false
    state.deliverThrows = false
    sqlite.run(
      "INSERT INTO teams (id,league,name,abbreviation) VALUES ('tm_away','mlb','New York Yankees','NYY'),('tm_home','mlb','Boston Red Sox','BOS')",
    )
    sqlite.run(
      "INSERT INTO games (id,league,sports_day,starts_at,status,away_team_id,home_team_id,away_score,home_score,away_rank,updated_at) VALUES ('gm_1','mlb','2026-10-08','2026-10-08T17:00:00Z','scheduled','tm_away','tm_home',0,0,3,'2026-10-08T00:00:00Z')",
    )
    sqlite.run(
      "INSERT INTO players (id,league,name) VALUES ('pl_judge','mlb','Aaron Judge')",
    )
    sqlite.run(
      "INSERT INTO source_ids (entity,source,source_id,internal_id) VALUES ('player','mlb-statsapi','99','pl_judge')",
    )
    ctx = memoryCtx()
    env = {
      DB: {},
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_JWK: '{}',
      LIVE_HUB: {
        idFromName: () => 'global',
        get: () => ({
          publish: (events) => {
            if (state.hubThrows) return Promise.reject(new Error('hub down'))
            if (state.hubHangs) return new Promise<void>(() => undefined)
            state.events.push(events)
            return Promise.resolve()
          },
        }),
      },
    }
    ;({ LiveGame } = await import('@/lib/live/LiveGame'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function instance() {
    return new LiveGame(ctx as never, env as never)
  }

  const rows = () => db.select().from(timelineItems)
  const gameRow = () =>
    sqliteQuery(
      sqlite,
      'SELECT status, away_score, home_score, away_rank, home_rank, away_conference, home_conference, box FROM games',
    )

  it('exports a stable item id and does nothing until tracked', async () => {
    const { itemId } = await import('@/lib/live/LiveGame')
    expect(itemId('gm_1', 'p1')).toBe('gm_1~p1')
    const game = instance()
    expect(await game.refresh()).toBe(false)
    expect(state.snapCalls).toBe(0)
    await game.alarm()
    expect(state.snapCalls).toBe(0)
    expect(ctx.alarmSets).toEqual([])
  })

  it('starts an alarm once and does not move it when tracked again', async () => {
    const game = instance()
    await game.track(tracked)
    const first = await ctx.storage.getAlarm()
    expect(first).toBe(NOW)
    vi.setSystemTime(NOW + 5_000)
    await game.track(tracked)
    expect(await ctx.storage.getAlarm()).toBe(first)
  })

  it('can put off its first poll, but never moves an alarm already set', async () => {
    const game = instance()
    await game.track(tracked, 90_000)
    expect(await ctx.storage.getAlarm()).toBe(NOW + 90_000)
    await game.track(tracked, 5_000)
    await game.track(tracked)
    expect(await ctx.storage.getAlarm()).toBe(NOW + 90_000)
  })

  it('persists a first poll as backfill, then diffs later polls', async () => {
    const game = instance()
    await game.track(tracked)
    state.snap = snap([
      play('a', {
        description: 'Single',
        playType: 'single',
        timeEstimated: true,
        involved: [{ sourceId: '99', name: '#99', role: 'batter' }],
        credits: [{ sourceId: '99', name: '#99', credit: 'pitcher' }],
        detail: { pitches: 1 },
      }),
      play('b', { sequence: 2 }),
      play('c', { sequence: 3 }),
      play('d', { sequence: 4 }),
      {
        kind: 'milestone',
        key: 'start',
        sequence: 0,
        occurredAt: '2026-10-08T17:00:00.000Z',
        segmentLabel: 'Top 1st',
        score: { away: 0, home: 0 },
        description: 'First pitch',
        milestone: 'start',
      },
    ])
    await game.alarm()
    const first = await rows()
    expect(first.map((row) => row.itemKey).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'start',
    ])
    const named = first.find((row) => row.itemKey === 'a')
    // Backfill keeps the Source's estimated time.
    expect(named?.occurredAt).toBe('2026-10-08T17:00:00.000Z')
    expect(named?.players).toEqual([
      { id: 'pl_judge', name: 'Aaron Judge', role: 'batter' },
    ])
    expect(named?.detail).toMatchObject({
      pitches: 1,
      credits: [{ id: 'pl_judge', credit: 'pitcher' }],
    })
    expect(state.alertBatches).toBe(0)
    expect(state.events[0]?.map((event) => event.type)).toEqual([
      'game',
      'upsert',
      'upsert',
      'upsert',
      'upsert',
      'upsert',
    ])
    const stored = gameRow()
    expect(stored[0]).toMatchObject({
      status: 'live',
      away_score: 1,
      home_score: 0,
      away_rank: 3,
    })

    // A live poll stamps a newly seen estimated time, revises facts, and
    // drops at most a few items the Source no longer lists.
    state.snap = snap([
      play('a', {
        description: 'Fielding error',
        playType: 'field_error',
        timeEstimated: true,
        involved: [{ sourceId: '99', name: '#99', role: 'batter' }],
      }),
      play('e', {
        sequence: 5,
        timeEstimated: true,
        significance: 'scoring',
        score: { away: 1, home: 0 },
        description: 'Home run',
        occurredAt: new Date(NOW).toISOString(),
      }),
      {
        kind: 'milestone',
        key: 'start',
        sequence: 0,
        occurredAt: '2026-10-08T17:00:00.000Z',
        segmentLabel: 'Top 1st',
        score: { away: 0, home: 0 },
        description: 'First pitch',
        milestone: 'start',
      },
    ])
    await game.alarm()
    const second = await rows()
    const revised = second.find((row) => row.itemKey === 'a')
    expect(revised?.description).toBe('Fielding error')
    expect(revised?.revisedAt).toBe(new Date(NOW).toISOString())
    expect(revised?.playType).toBe('field_error')
    // A backfilled play keeps the time it was first written with.
    expect(revised?.occurredAt).toBe('2026-10-08T17:00:00.000Z')
    const fresh = second.find((row) => row.itemKey === 'e')
    expect(fresh?.occurredAt).toBe(new Date(NOW).toISOString())
    expect(second.map((row) => row.itemKey).sort()).toEqual(['a', 'e', 'start'])
    expect(state.alertBatches).toBe(1)
  })

  it('a revision overwrites revisedAt, playType, scores and the segment', async () => {
    const game = instance()
    await game.track(tracked)
    state.snap = snap([
      play('a', { description: 'Single', playType: 'single' }),
    ])
    await game.alarm()
    state.snap = snap([
      play('a', {
        description: 'Fielding error',
        playType: 'field_error',
        segmentLabel: 'Top 2nd',
        score: { away: 2, home: 0 },
      }),
    ])
    await game.alarm()
    const revised = (await rows()).find((row) => row.itemKey === 'a')
    expect(revised).toMatchObject({
      description: 'Fielding error',
      playType: 'field_error',
      segmentLabel: 'Top 2nd',
      awayScore: 2,
      revisedAt: new Date(NOW).toISOString(),
    })
  })

  it('records an Overturn beside the original and stores a box score', async () => {
    const game = instance()
    await game.track(tracked)
    await ctx.storage.deleteAlarm()
    state.snap = snap([
      play('td', {
        significance: 'scoring',
        description: 'Touchdown',
        score: { away: 1, home: 0 },
      }),
    ])
    expect(await game.refresh()).toBe(true)
    state.snap = snap(
      [
        play('td', {
          significance: 'routine',
          description: 'Reversed',
          score: { away: 0, home: 0 },
        }),
      ],
      {
        away: {
          sourceId: 'nyy',
          name: 'New York Yankees',
          abbreviation: 'NYY',
          logoUrl: null,
          rank: 4,
          conference: null,
        },
        home: {
          sourceId: 'bos',
          name: 'Boston Red Sox',
          abbreviation: 'BOS',
          logoUrl: null,
          rank: null,
          conference: 'sec',
        },
        box: {
          linescore: {
            segments: ['1'],
            away: [0],
            home: [0],
            totalColumns: ['R'],
            awayTotals: [0],
            homeTotals: [0],
          },
          tables: [
            {
              side: 'away',
              title: 'Batting',
              columns: ['AB'],
              rows: [
                {
                  player: { sourceId: '99', name: 'Aaron Judge' },
                  note: 'CF',
                  sub: false,
                  values: [1],
                },
              ],
            },
          ],
        },
      },
    )
    await game.alarm()
    const stored = await rows()
    const original = stored.find((row) => row.itemKey === 'td')
    const news = stored.find((row) => row.itemKey === 'overturn:td')
    expect(original?.status).toBe('overturned')
    expect(news).toMatchObject({
      kind: 'overturn',
      significance: 'scoring',
      description: 'Overturned: Touchdown',
      overturnOf: 'gm_1~td',
    })
    const current = gameRow()[0]
    expect(current?.away_rank).toBe(4)
    expect(current?.home_rank).toBeNull()
    expect(current?.home_conference).toBe('sec')
    const box = JSON.parse(String(current?.box)) as {
      tables: Array<{ rows: Array<{ player: { id: string; name: string } }> }>
    }
    expect(box.tables[0]?.rows[0]?.player).toEqual({
      id: 'pl_judge',
      name: 'Aaron Judge',
    })
    expect(state.events.at(-1)?.some((event) => event.type === 'remove')).toBe(
      false,
    )
  })

  it('ignores a mass removal and an empty Source response', async () => {
    const game = instance()
    await game.track(tracked)
    state.snap = snap([play('a'), play('b'), play('c'), play('d'), play('e')])
    await game.alarm()
    state.snap = snap([play('a')])
    await game.alarm()
    expect((await rows()).map((row) => row.itemKey).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ])
    state.snap = snap([])
    await game.alarm()
    expect(await rows()).toHaveLength(5)
  })

  it('schedules the next poll from the snapshot, and stops when the game is over', async () => {
    const game = instance()
    await game.track(tracked)
    ctx.alarmSets.length = 0
    state.snap = snap([play('a')], { pollHintSeconds: 10 })
    await game.alarm()
    expect(ctx.alarmSets.at(-1)).toBe(NOW + 10_000)

    ctx.alarmSets.length = 0
    state.snap = snap([], {
      status: 'scheduled',
      startsAt: '2026-10-08T20:00:00.000Z',
    })
    await game.alarm()
    expect(ctx.alarmSets).toEqual([])

    state.snap = snap([], {
      status: 'scheduled',
      startsAt: new Date(NOW + 5 * 60_000).toISOString(),
    })
    await game.alarm()
    expect(ctx.alarmSets.at(-1)).toBe(NOW + 60_000)

    ctx.alarmSets.length = 0
    state.snap = snap([], { status: 'delayed' })
    await game.alarm()
    expect(ctx.alarmSets.at(-1)).toBe(NOW + 60_000)

    ctx.alarmSets.length = 0
    state.snap = snap([], { status: 'final' })
    await game.alarm()
    expect(ctx.alarmSets).toEqual([])
    const finalRow = gameRow()[0]
    expect(finalRow?.status).toBe('final')
  })

  it("keeps a play's players on a fallback that no longer names them", async () => {
    const game = instance()
    await game.track(tracked)
    const judge = { sourceId: '99', name: 'Aaron Judge', role: 'batter' }
    const fallback = 'core plays unavailable'
    // Named while it's the latest play…
    state.snap = snap([play('a', { involved: [judge] })], { fallback })
    await game.alarm()
    // …then not, once another play comes after it.
    state.snap = snap([play('a'), play('b', { sequence: 2 })], { fallback })
    await game.alarm()

    const linked = () =>
      sqliteQuery(sqlite, 'SELECT item_id, player_id FROM item_players')
    expect(linked()).toEqual([{ item_id: 'gm_1~a', player_id: 'pl_judge' }])
    const [a] = (await rows()).filter((r) => r.itemKey === 'a')
    expect(a.revisedAt).toBeNull()

    // Outside a fallback the Source's word stands, players or none.
    state.snap = snap([play('a'), play('b', { sequence: 2 })])
    await game.alarm()
    expect(linked()).toEqual([])
  })

  it('warns of a Source fallback, and reports it only once it lasts', async () => {
    const { FALLBACK_REPORT_EVERY } = await import('@/lib/live/LiveGame')
    const game = instance()
    await game.track(tracked)
    const poll = async (times: number, fallback?: string) => {
      state.snap = snap([play('a')], fallback ? { fallback } : {})
      for (let i = 0; i < times; i++) await game.alarm()
    }

    await poll(FALLBACK_REPORT_EVERY - 1, 'core plays unavailable')
    expect(state.reports).toEqual([])
    await poll(1, 'core plays unavailable')
    // No play names anyone: it's losing them, so the admins hear of it.
    expect(state.reports).toEqual(['source-fallback-lossy'])
    expect(state.notified).toEqual([true])

    // The Source answering in full starts the count over.
    await poll(1)
    await poll(FALLBACK_REPORT_EVERY - 1, 'core plays unavailable')
    expect(state.reports).toHaveLength(1)
    await poll(1, 'core plays unavailable')
    expect(state.reports).toHaveLength(2)
    // Still on it: reported again each as many polls more.
    await poll(FALLBACK_REPORT_EVERY, 'core plays unavailable')
    expect(state.reports).toHaveLength(3)
  })

  it('only logs a fallback that still names who was Involved', async () => {
    const { FALLBACK_REPORT_EVERY } = await import('@/lib/live/LiveGame')
    const game = instance()
    await game.track(tracked)
    const judge = { sourceId: '99', name: 'Aaron Judge', role: 'batter' }
    state.snap = snap(
      [
        play('a', { involved: [judge] }),
        play('b', { sequence: 2, involved: [judge] }),
        play('c', { sequence: 3, involved: [judge] }),
        play('d', { sequence: 4 }),
      ],
      { fallback: 'core plays unavailable' },
    )
    for (let i = 0; i < FALLBACK_REPORT_EVERY; i++) await game.alarm()
    // Three of four plays: as good as the Source in full, so logged quietly.
    expect(state.reports).toEqual(['source-fallback'])
    expect(state.notified).toEqual([false])
  })

  it('retries a failed poll, reports a 429 only after it lasts, and gives up', async () => {
    const game = instance()
    await game.track(tracked)
    ctx.alarmSets.length = 0
    state.snapError = new Error('NHL 429')
    await game.alarm()
    expect(state.reports).toEqual([])
    expect(ctx.alarmSets.at(-1)).toBe(NOW + 60_000)

    vi.setSystemTime(NOW + 15 * 60_000)
    await game.alarm()
    expect(state.reports).toEqual(['live-game'])
    expect(ctx.alarmSets.at(-1)).toBe(NOW + 15 * 60_000 + 60_000)

    state.snapError = new Error('socket reset')
    await game.alarm()
    expect(state.reports).toEqual(['live-game', 'live-game'])
    expect(ctx.alarmSets.at(-1)).toBe(NOW + 15 * 60_000 + 30_000)

    state.snapError = null
    state.snap = snap([play('a')])
    await game.alarm()
    state.snapError = new Error('socket reset')
    state.reports.length = 0
    ctx.alarmSets.length = 0
    for (let i = 0; i < 20; i++) await game.alarm()
    expect(ctx.alarmSets).toHaveLength(19)
    expect(state.reports).toHaveLength(20)
  })

  it('does not remember a poll whose write failed, and still tracks after a bad push', async () => {
    const game = instance()
    await game.track(tracked)
    state.snap = snap([play('a', { significance: 'scoring' })])
    const batch = (state.db as { batch: (q: unknown) => Promise<unknown> })
      .batch
    ;(state.db as { batch: (q: unknown) => Promise<unknown> }).batch = () =>
      Promise.reject(new Error('d1 down'))
    await game.alarm()
    expect(await rows()).toHaveLength(0)
    expect(
      [...ctx.data.keys()].filter((key) => key.startsWith('seen:')),
    ).toEqual([])
    ;(state.db as { batch: (q: unknown) => Promise<unknown> }).batch = batch
    await game.alarm()
    expect(await rows()).toHaveLength(1)

    // The Hub failing is reported, and the play still Alerts.
    state.hubThrows = true
    state.snap = snap([
      play('a', { significance: 'scoring' }),
      play('b', {
        significance: 'scoring',
        description: 'Sac fly',
        occurredAt: new Date(NOW).toISOString(),
      }),
    ])
    const alertsBefore = state.alertBatches
    state.reports.length = 0
    await game.alarm()
    await ctx.settle()
    expect(state.reports).toEqual(['live-hub'])
    expect(state.alertBatches).toBe(alertsBefore + 1)

    state.hubThrows = false
    state.deliverThrows = true
    state.snap = snap([
      play('a', { significance: 'scoring' }),
      play('b', { significance: 'scoring' }),
      play('c', {
        significance: 'scoring',
        description: 'RBI single',
        occurredAt: new Date(NOW).toISOString(),
      }),
    ])
    await game.alarm()
    expect(state.reports.at(-1)).toBe('alerts')
    expect(await rows()).toHaveLength(3)
  })

  it('caps non-final alerts and always allows a final', async () => {
    const game = instance()
    await game.track(tracked)
    state.snap = snap([play('old')])
    await game.alarm()
    state.extraAllows = 6
    state.snap = snap([
      play('old'),
      play('hr', {
        significance: 'scoring',
        description: 'Home run',
        occurredAt: new Date(NOW).toISOString(),
      }),
    ])
    await game.alarm()
    expect(state.allowLog).toEqual([true, true, true, true, true, true, false])

    state.allowLog = []
    state.extraFinal = true
    state.snap = snap([
      play('old'),
      play('hr'),
      {
        kind: 'milestone',
        key: 'final',
        sequence: 9,
        occurredAt: new Date(NOW).toISOString(),
        segmentLabel: 'Final',
        score: { away: 1, home: 0 },
        description: 'Final',
        milestone: 'final',
      },
    ])
    await game.alarm()
    expect(state.allowLog.every(Boolean)).toBe(true)
    expect(state.allowLog.length).toBeGreaterThan(6)
  })

  it('reads plays it already saw when the object wakes', async () => {
    const game = instance()
    await game.track(tracked)
    state.snap = snap([play('a', { significance: 'scoring' })])
    await game.alarm()
    const woken = instance()
    state.alertBatches = 0
    await woken.alarm()
    expect(await rows()).toHaveLength(1)
    expect(state.alertBatches).toBe(0)
  })

  it('keeps the rows and skips alerts when push keys are unset', async () => {
    env = {
      ...env,
      VAPID_PUBLIC_KEY: undefined,
      VAPID_PRIVATE_JWK: undefined,
    }
    const game = instance()
    await game.track(tracked)
    state.snap = snap([play('a')])
    await game.alarm()
    state.snap = snap([
      play('a'),
      play('hr', {
        significance: 'scoring',
        description: 'Home run',
        occurredAt: new Date(NOW).toISOString(),
      }),
    ])
    await game.alarm()
    expect(state.alertBatches).toBe(0)
    expect(await rows()).toHaveLength(2)
  })

  it('does not hold the poll for the Hub', async () => {
    const game = instance()
    await game.track(tracked)
    state.hubHangs = true
    state.snap = snap([play('a')])
    await game.alarm()
    expect(await rows()).toHaveLength(1)
    expect(ctx.alarmSets.at(-1)).toBe(NOW + 5_000)
  })

  it('runs a refresh and the alarm one at a time', async () => {
    const game = instance()
    await game.track(tracked)
    state.snap = snap([play('old')])
    await game.alarm()
    await ctx.storage.deleteAlarm()
    state.snap = snap([
      play('old'),
      play('hr', {
        significance: 'scoring',
        description: 'Home run',
        occurredAt: new Date(NOW).toISOString(),
      }),
    ])
    // A slow Source: the refresh is mid-fetch when the alarm fires.
    let release = () => undefined as void
    state.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const refreshed = game.refresh()
    const polled = game.alarm()
    release()
    state.gate = null
    expect(await refreshed).toBe(true)
    await polled
    await ctx.settle()

    expect(state.alertBatches).toBe(1)
    const hr = state.events
      .flat()
      .filter(
        (e) =>
          e.type === 'upsert' &&
          (e as { item?: { id: string } }).item?.id === 'gm_1~hr',
      )
    expect(hr).toHaveLength(1)
  })

  it('refreshes at most every few minutes, and not while an alarm is due', async () => {
    const { REFRESH_EVERY_MS } = await import('@/lib/live/LiveGame')
    const game = instance()
    await game.track(tracked)
    state.snap = snap([play('a')], { status: 'final' })
    // The alarm polls anyway.
    expect(await game.refresh()).toBe(false)
    expect(state.snapCalls).toBe(0)

    await ctx.storage.deleteAlarm()
    expect(await game.refresh()).toBe(true)
    // Every page view of the Game asks; one poll answers them all.
    expect(await game.refresh()).toBe(false)
    vi.setSystemTime(NOW + REFRESH_EVERY_MS - 1)
    expect(await game.refresh()).toBe(false)
    expect(state.snapCalls).toBe(1)

    vi.setSystemTime(NOW + REFRESH_EVERY_MS)
    expect(await game.refresh()).toBe(true)
    expect(state.snapCalls).toBe(2)
  })

  it('rewrites the game and sends a game event only when it changed', async () => {
    const game = instance()
    await game.track(tracked)
    const updatedAt = () =>
      sqliteQuery(sqlite, 'SELECT updated_at FROM games')[0]?.updated_at
    state.snap = snap([play('a')])
    await game.alarm()
    await ctx.settle()
    const written = updatedAt()
    expect(state.events).toHaveLength(1)

    // Nothing new: no write, nothing to publish.
    vi.setSystemTime(NOW + 10_000)
    await game.alarm()
    await ctx.settle()
    expect(updatedAt()).toBe(written)
    expect(state.events).toHaveLength(1)

    state.snap = snap([play('a')], { score: { away: 2, home: 0 } })
    await game.alarm()
    await ctx.settle()
    expect(updatedAt()).toBe(new Date(NOW + 10_000).toISOString())
    expect(gameRow()[0]?.away_score).toBe(2)
    expect(state.events.at(-1)?.map((event) => event.type)).toEqual(['game'])
  })

  it('keeps a full box score over one that is only the Plays', async () => {
    const game = instance()
    await game.track(tracked)
    const storedBox = () =>
      JSON.parse(String(gameRow()[0]?.box)) as { tables: Array<unknown> }
    const partial = {
      box: boxOf([]),
      boxPartial: true,
      fallback: 'NHL boxscore unavailable: NHL 503',
    }

    // Nothing better stored yet: the Plays' box stands in.
    state.snap = snap([play('a')], partial)
    await game.alarm()
    expect(storedBox().tables).toHaveLength(0)

    state.snap = snap([play('a')], { box: boxOf([skaters]) })
    await game.alarm()
    expect(storedBox().tables).toHaveLength(1)

    state.snap = snap([play('a')], { ...partial, score: { away: 2, home: 0 } })
    await game.alarm()
    expect(storedBox().tables).toHaveLength(1)
    expect(gameRow()[0]?.away_score).toBe(2)
  })

  it('keeps polling a final Game slowly until its full box score arrives', async () => {
    const { BOX_RETRY_MS, MAX_BOX_RETRIES } =
      await import('@/lib/live/LiveGame')
    const game = instance()
    await game.track(tracked)
    ctx.alarmSets.length = 0
    const partialFinal = snap([play('a')], {
      status: 'final',
      box: boxOf([]),
      boxPartial: true,
      fallback: 'NHL boxscore unavailable: NHL 503',
    })
    state.snap = partialFinal
    await game.alarm()
    await game.alarm()
    expect(ctx.alarmSets).toEqual([NOW + BOX_RETRY_MS, NOW + BOX_RETRY_MS])

    // The full box arrives: stored, and the Game stops polling.
    state.snap = snap([play('a')], { status: 'final', box: boxOf([skaters]) })
    await game.alarm()
    expect(ctx.alarmSets).toHaveLength(2)
    expect(JSON.parse(String(gameRow()[0]?.box))).toMatchObject({
      tables: [{ title: 'Skaters' }],
    })

    // Never arriving, it gives up after MAX_BOX_RETRIES.
    ctx.alarmSets.length = 0
    state.snap = partialFinal
    for (let i = 0; i <= MAX_BOX_RETRIES; i++) await game.alarm()
    expect(ctx.alarmSets).toHaveLength(MAX_BOX_RETRIES)
  })

  it('names every unnamed player, however many a poll brings', async () => {
    const many = Array.from({ length: 100 }, (_, i) => i)
    sqlite.run(
      `INSERT INTO players (id,league,name) VALUES ${many.map((i) => `('pl_n${i}','mlb','Player ${i}')`).join(',')}`,
    )
    sqlite.run(
      `INSERT INTO source_ids (entity,source,source_id,internal_id) VALUES ${many.map((i) => `('player','mlb-statsapi','s${i}','pl_n${i}')`).join(',')}`,
    )
    const game = instance()
    await game.track(tracked)
    state.snap = snap([
      play('a', {
        involved: many.map((i) => ({
          sourceId: `s${i}`,
          name: `#s${i}`,
          role: 'fielder',
        })),
      }),
    ])
    await game.alarm()
    const [a] = await rows()
    expect(a.players).toHaveLength(100)
    expect(a.players.filter((p) => p.name.startsWith('#'))).toEqual([])
  })

  it('records more Overturns in one poll than a statement can bind', async () => {
    const keys = Array.from({ length: 120 }, (_, i) => `td${i}`)
    const game = instance()
    await game.track(tracked)
    state.snap = snap(
      keys.map((key) =>
        play(key, { significance: 'scoring', description: 'Touchdown' }),
      ),
    )
    await game.alarm()
    state.snap = snap(keys.map((key) => play(key, { description: 'Reversed' })))
    await game.alarm()
    const stored = await rows()
    expect(stored.filter((row) => row.status === 'overturned')).toHaveLength(
      120,
    )
    expect(stored.filter((row) => row.kind === 'overturn')).toHaveLength(120)
    const upserts = state.events
      .at(-1)
      ?.filter((event) => event.type === 'upsert')
    expect(upserts).toHaveLength(240)
  })

  it('gives a Game that gave up one try per wake until a poll succeeds', async () => {
    const game = instance()
    await game.track(tracked)
    state.snapError = new Error('socket reset')
    for (let i = 0; i < 20; i++) await game.alarm()
    // It stopped; the schedule sync wakes it again.
    await ctx.storage.deleteAlarm()
    ctx.alarmSets.length = 0
    await game.track(tracked)
    await game.alarm()
    // Still failing: one try, not another run of fast retries.
    expect(ctx.alarmSets).toEqual([NOW])

    await ctx.storage.deleteAlarm()
    state.snapError = null
    state.snap = snap([play('a')])
    await game.track(tracked)
    await game.alarm()
    expect(ctx.data.get('errors')).toBe(0)
    expect(ctx.alarmSets.at(-1)).toBe(NOW + 5_000)
  })

  it('keeps an Overturned play struck through when it is revised again', async () => {
    const game = instance()
    await game.track(tracked)
    state.snap = snap([
      play('td', {
        significance: 'scoring',
        description: 'Touchdown',
        score: { away: 1, home: 0 },
      }),
    ])
    await game.alarm()
    state.snap = snap([
      play('td', { description: 'Reversed', score: { away: 0, home: 0 } }),
    ])
    await game.alarm()
    state.snap = snap([
      play('td', {
        description: 'Reversed on review',
        score: { away: 0, home: 0 },
      }),
    ])
    await game.alarm()
    const original = (await rows()).find((row) => row.itemKey === 'td')
    expect(original).toMatchObject({
      status: 'overturned',
      description: 'Reversed on review',
    })
  })

  it('forgets the Alert cap once the Game is final', async () => {
    const game = instance()
    await game.track(tracked)
    state.snap = snap([play('old')])
    await game.alarm()
    const hr = play('hr', {
      significance: 'scoring',
      description: 'Home run',
      occurredAt: new Date(NOW).toISOString(),
    })
    state.snap = snap([play('old'), hr])
    await game.alarm()
    expect(ctx.data.has('alertLog')).toBe(true)

    state.snap = snap(
      [
        play('old'),
        hr,
        {
          kind: 'milestone',
          key: 'final',
          sequence: 9,
          occurredAt: new Date(NOW).toISOString(),
          segmentLabel: 'Final',
          score: { away: 1, home: 0 },
          description: 'Final',
          milestone: 'final',
        },
      ],
      { status: 'final' },
    )
    await game.alarm()
    expect(state.alertBatches).toBe(2)
    expect(ctx.data.has('alertLog')).toBe(false)
  })
})

const skaters = {
  side: 'away' as const,
  title: 'Skaters',
  columns: ['G'],
  rows: [
    {
      player: { sourceId: '99', name: 'Aaron Judge' },
      note: 'C',
      sub: false,
      values: [1],
    },
  ],
}

function boxOf(tables: Array<typeof skaters>): GameSnapshot['box'] {
  return {
    linescore: {
      segments: ['1'],
      away: [1],
      home: [0],
      totalColumns: ['G'],
      awayTotals: [1],
      homeTotals: [0],
    },
    tables,
  }
}

function sqliteQuery(
  sqlite: {
    query?: (sql: string) => { all: () => Array<Record<string, unknown>> }
  },
  sql: string,
): Array<Record<string, unknown>> {
  const db = sqlite as unknown as {
    query: (s: string) => { all: () => Array<Record<string, unknown>> }
  }
  return db.query(sql).all()
}
