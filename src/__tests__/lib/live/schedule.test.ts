import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type { ScheduledGame } from '@/lib/model/types'
import {
  BACKFILL_SPACING_MS,
  needsTracking,
  syncLeague,
} from '@/lib/live/schedule'
import { games, teams } from '@/lib/db/schema'

const state = vi.hoisted(() => ({
  db: null as unknown,
  scheduled: [] as Array<ScheduledGame>,
  /** Statements in each batch syncLeague sends. */
  batches: [] as Array<number>,
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))

vi.mock('@/lib/sources', () => ({
  ACTIVE_LEAGUES: ['nfl'],
  sourceFor: () => ({
    source: 'espn',
    schedule: () => Promise.resolve(state.scheduled),
  }),
}))

const now = new Date('2026-10-01T23:00:00Z')

describe('needsTracking', () => {
  it('tracks live and delayed Games', () => {
    expect(needsTracking({ status: 'live', startsAt: '' }, 'live', now)).toBe(
      true,
    )
    expect(
      needsTracking({ status: 'delayed', startsAt: '' }, 'live', now),
    ).toBe(true)
  })

  it('wakes scheduled Games only inside the warmup window', () => {
    expect(
      needsTracking(
        { status: 'scheduled', startsAt: '2026-10-01T23:10:00Z' },
        undefined,
        now,
      ),
    ).toBe(true)
    expect(
      needsTracking(
        { status: 'scheduled', startsAt: '2026-10-02T01:00:00Z' },
        undefined,
        now,
      ),
    ).toBe(false)
  })

  it('backfills a finished Game once, then leaves it alone', () => {
    expect(needsTracking({ status: 'final', startsAt: '' }, 'live', now)).toBe(
      true,
    )
    expect(
      needsTracking({ status: 'final', startsAt: '' }, undefined, now),
    ).toBe(true)
    expect(needsTracking({ status: 'final', startsAt: '' }, 'final', now)).toBe(
      false,
    )
  })
})

function game(
  n: number,
  overrides: Partial<ScheduledGame> = {},
): ScheduledGame {
  return {
    league: 'nfl',
    sourceGameId: `g${n}`,
    status: 'scheduled',
    startsAt: '2026-10-02T17:00:00.000Z',
    sportsDay: '2026-10-01',
    away: {
      sourceId: `a${n}`,
      name: `Away ${n}`,
      abbreviation: `A${n}`,
      logoUrl: `https://logos/a${n}.png`,
    },
    home: {
      sourceId: `h${n}`,
      name: `Home ${n}`,
      abbreviation: `H${n}`,
      logoUrl: `https://logos/h${n}.png`,
    },
    score: { away: 0, home: 0 },
    ...overrides,
  }
}

describe.skipIf(!isBun)('syncLeague', () => {
  let tracked: Array<{ gameId: string; delayMs: number | undefined }>
  let env: CloudflareEnv
  let db: Awaited<ReturnType<typeof sqliteDb>>['db']

  beforeEach(async () => {
    db = (await sqliteDb()).db
    const batch = db.batch
    db.batch = (queries) => {
      state.batches.push(queries.length)
      return batch(queries)
    }
    state.db = db
    state.batches = []
    tracked = []
    env = {
      DB: {},
      LIVE_GAME: {
        idFromName: (name: string) => name,
        get: (gameId: string) => ({
          track: (_game: unknown, delayMs?: number) => {
            tracked.push({ gameId, delayMs })
            return Promise.resolve()
          },
        }),
      },
    } as unknown as CloudflareEnv
  })

  const sync = (day = '2026-10-01') => syncLeague(env, 'nfl', day, now)

  it('rewrites nothing when the schedule has not changed', async () => {
    state.scheduled = [game(1), game(2)]
    await sync()
    expect(await db.select().from(games)).toHaveLength(2)
    const before = await db.select().from(games)

    state.batches = []
    await sync()
    expect(state.batches).toEqual([])
    expect(await db.select().from(games)).toEqual(before)
  })

  it('writes only the Games and Teams that changed', async () => {
    state.scheduled = [game(1), game(2)]
    await sync()

    const later = new Date('2026-10-01T23:05:00Z')
    state.scheduled = [
      game(1, { startsAt: '2026-10-02T18:00:00.000Z' }),
      game(2, {
        home: { ...game(2).home, logoUrl: 'https://logos/new.png' },
      }),
    ]
    state.batches = []
    await syncLeague(env, 'nfl', '2026-10-01', later)
    // One Game update and one Team upsert.
    expect(state.batches).toEqual([2])
    const rows = await db.select().from(games).orderBy(games.startsAt)
    expect(rows.map((r) => [r.startsAt, r.updatedAt])).toEqual([
      ['2026-10-02T17:00:00.000Z', now.toISOString()],
      ['2026-10-02T18:00:00.000Z', later.toISOString()],
    ])
    const logos = (await db.select().from(teams)).map((t) => t.logoUrl)
    expect(logos).toContain('https://logos/new.png')
    expect(logos).not.toContain('https://logos/h2.png')
  })

  it('leaves a Game its LiveGame owns alone, and keeps waking it', async () => {
    state.scheduled = [game(1, { status: 'live' })]
    await sync()
    const [row] = await db.select().from(games)
    expect(tracked).toEqual([{ gameId: row.id, delayMs: 0 }])

    state.scheduled = [game(1, { status: 'live', score: { away: 7, home: 0 } })]
    state.batches = []
    await sync()
    expect(state.batches).toEqual([])
    expect(tracked).toHaveLength(2)
  })

  it('moves a scheduled Game to live, then stops writing it', async () => {
    state.scheduled = [game(1)]
    await sync()
    state.scheduled = [game(1, { status: 'live' })]
    await sync()
    expect((await db.select().from(games))[0].status).toBe('live')
    expect(tracked).toHaveLength(1)
  })

  it('syncs a day with more Games than a statement can bind', async () => {
    state.scheduled = Array.from({ length: 120 }, (_, i) => game(i))
    await sync()
    expect(await db.select().from(games)).toHaveLength(120)
    state.scheduled = Array.from({ length: 120 }, (_, i) =>
      game(i, { startsAt: '2026-10-02T18:00:00.000Z' }),
    )
    await sync()
    const rows = await db.select().from(games)
    expect(rows.every((r) => r.startsAt === '2026-10-02T18:00:00.000Z')).toBe(
      true,
    )
  })

  it('spaces out the first polls of a past day of Finals', async () => {
    state.scheduled = [
      ...Array.from({ length: 4 }, (_, i) =>
        game(i, { status: 'final', score: { away: 3, home: 10 } }),
      ),
      game(9, { status: 'live' }),
    ]
    await sync()
    expect(tracked.map((t) => t.delayMs).sort((a, b) => a! - b!)).toEqual([
      0,
      0,
      BACKFILL_SPACING_MS,
      2 * BACKFILL_SPACING_MS,
      3 * BACKFILL_SPACING_MS,
    ])
  })
})
