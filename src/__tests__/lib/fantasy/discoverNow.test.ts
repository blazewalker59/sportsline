/**
 * A manual Fantasy sync looks for new leagues. A failed lookup is reported
 * (the health page reads error_events) and does not stop the sync. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type * as FantasySync from '@/lib/fantasy/sync'
import type * as SleeperClient from '@/lib/fantasy/sleeper/client'
import type * as SleeperSync from '@/lib/fantasy/sleeper/sync'

const state = vi.hoisted(() => ({
  db: null as unknown,
  session: { swid: '{s}', espnS2: 'cookie' } as {
    swid: string
    espnS2: string
  } | null,
  espnError: null as Error | null,
  sleeperError: null as Error | null,
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))
vi.mock('@/lib/fantasy/sync', async (original) => {
  const mod = await original<typeof FantasySync>()
  return {
    ...mod,
    loadSession: () => Promise.resolve(state.session),
    discover: () =>
      state.espnError ? Promise.reject(state.espnError) : Promise.resolve(0),
  }
})
vi.mock('@/lib/fantasy/sleeper/client', async (original) => {
  const mod = await original<typeof SleeperClient>()
  return {
    ...mod,
    sleeperState: () =>
      Promise.resolve({ season: '2026', week: 5, league_season: '2026' }),
  }
})
vi.mock('@/lib/fantasy/sleeper/sync', async (original) => {
  const mod = await original<typeof SleeperSync>()
  return {
    ...mod,
    discover: () =>
      state.sleeperError
        ? Promise.reject(state.sleeperError)
        : Promise.resolve(0),
  }
})

describe.skipIf(!isBun)('discovering leagues on a manual sync', () => {
  const env = { DB: {} } as CloudflareEnv

  beforeEach(async () => {
    const fresh = await sqliteDb()
    state.db = fresh.db
    state.session = { swid: '{s}', espnS2: 'cookie' }
    state.espnError = new Error('ESPN 503')
    state.sleeperError = new Error('Sleeper 503')
    fresh.sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','Viewer','v@example.com',1,0,0)",
    )
    fresh.sqlite.run(
      "INSERT INTO sleeper_accounts (viewer_id,username,user_id,status,connected_at) VALUES ('u1','viewer','s1','ok','2026-10-01T00:00:00Z')",
    )
  })

  it('reports both providers and still resolves', async () => {
    const { discoverConnectedLeagues } =
      await import('@/lib/fantasy/discoverNow')
    const { errorEvents } = await import('@/lib/db/schema')
    const db = state.db as Db.Database
    await expect(discoverConnectedLeagues(env, db, 'u1')).resolves.toEqual({
      espn: true,
      sleeper: true,
    })
    const rows = await db.select().from(errorEvents)
    expect(rows.map((r) => r.scope).sort()).toEqual(['espn', 'sleeper'])
    expect(rows.map((r) => r.message).sort()).toEqual([
      'ESPN 503',
      'Sleeper 503',
    ])
    for (const row of rows) {
      expect(row.context).toMatchObject({ viewerId: 'u1', step: 'discovery' })
    }
  })
})
