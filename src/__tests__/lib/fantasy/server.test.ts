/**
 * Fantasy server functions: connecting ESPN seals each cookie to its
 * Viewer and turns away a mangled one, and disconnecting or reordering is
 * all or nothing. Through the Start compiler's provider module so the
 * handlers run; ESPN is a stand-in. Bun only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { atomicBatch } from '../../helpers/atomicBatch'
import { isBun, sqliteDb } from '../../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type * as FantasyClient from '@/lib/fantasy/client'
import type * as FantasySync from '@/lib/fantasy/sync'
import * as caller from '@/lib/fantasy/server'
// @ts-expect-error The Start compiler's provider split is a query, not a TS path.
import * as provider from '@/lib/fantasy/server?tss-serverfn-split'
import { isLegacy, unseal } from '@/lib/kalshi/vault'
import {
  espnAccounts,
  fantasyLeagues,
  sleeperAccounts,
  whoHas,
} from '@/lib/db/schema'

type Opened = Awaited<ReturnType<typeof sqliteDb>>

interface Exec<T> {
  result?: T
  error?: unknown
}

type ServerFn = (opts: { data?: unknown }) => Promise<Exec<unknown>>

const SECRET = Buffer.alloc(32, 5).toString('base64')

const state = vi.hoisted(() => ({
  opened: null as Opened | null,
  env: {} as CloudflareEnv,
}))

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.opened?.db,
  getDb: () => state.opened?.db,
  getCloudflareEnv: () => state.env,
}))

vi.mock('@/lib/auth/server', () => ({
  getAuth: () => ({
    api: {
      getSession: () =>
        Promise.resolve({
          user: { id: 'u1', name: 'V', email: 'v@example.com' },
        }),
    },
  }),
}))

vi.mock('@/lib/fantasy/client', async (original) => ({
  ...(await original<typeof FantasyClient>()),
  fanProfile: () => Promise.resolve(null),
}))

vi.mock('@/lib/fantasy/sync', async (original) => ({
  ...(await original<typeof FantasySync>()),
  syncAccount: () => Promise.resolve(0),
}))

vi.mock('@/lib/live/startViewerSync', () => ({
  startViewerSync: () => Promise.resolve(),
}))

const fns = provider as unknown as Record<string, ServerFn>

async function call<T>(name: string, data?: unknown): Promise<Exec<T>> {
  const { serverRequestContext } = await import('@/lib/db')
  const fn = fns[`${name}_createServerFn_handler`]
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
        () => fn({ data }) as Promise<Exec<T>>,
      ),
  )
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function opened(): Opened {
  if (!state.opened) throw new Error('db')
  return state.opened
}

const SWID = '{0D3C2B1A-1111-2222-3333-444455556666}'
const S2 = `AE${'b'.repeat(60)}%2B%2F`

async function league(id: string, kind: 'espn' | 'sleeper') {
  await opened().db.insert(fantasyLeagues).values({
    id,
    viewerId: 'u1',
    sport: 'football',
    provider: kind,
    leagueId: id,
    season: 2026,
    name: id,
    updatedAt: '2026-10-08T00:00:00Z',
  })
}

describe.skipIf(!isBun)('Fantasy server functions', () => {
  beforeEach(async () => {
    state.opened = await sqliteDb()
    atomicBatch(state.opened.sqlite, state.opened.db)
    state.env = {
      DB: {},
      ESPN_ENCRYPTION_KEY: SECRET,
    } as unknown as CloudflareEnv
    opened().sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','V','v@example.com',1,0,0)",
    )
  })

  it('loads the caller wrappers coverage measures', () => {
    expect(typeof caller.connectEspn).toBe('function')
  })

  it('seals each ESPN cookie to its Viewer and purpose', async () => {
    const connected = await call('connectEspn', { swid: SWID, espnS2: S2 })
    expect(connected.error).toBeUndefined()
    const row = (await opened().db.select().from(espnAccounts).get())!
    const swid = { ciphertext: row.swidCiphertext, iv: row.swidIv }
    const s2 = { ciphertext: row.s2Ciphertext, iv: row.s2Iv }
    expect(
      await unseal(SECRET, swid, { purpose: 'espn-swid', viewerId: 'u1' }),
    ).toBe(SWID)
    expect(
      await unseal(SECRET, s2, { purpose: 'espn-s2', viewerId: 'u1' }),
    ).toBe(decodeURIComponent(S2))
    // Swapped between the two columns, neither opens.
    await expect(
      unseal(SECRET, swid, { purpose: 'espn-s2', viewerId: 'u1' }),
    ).rejects.toThrow()
    const { loadSession } =
      await vi.importActual<typeof FantasySync>('@/lib/fantasy/sync')
    expect(await loadSession(state.env, 'u1')).toEqual({
      swid: SWID,
      espnS2: decodeURIComponent(S2),
    })
  })

  it('opens cookies sealed before binding, and binds them', async () => {
    // Sealed the old way: no version, no associated data.
    const key = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(Buffer.from(SECRET, 'base64')),
      'AES-GCM',
      false,
      ['encrypt'],
    )
    const legacy = async (plaintext: string) => {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(plaintext),
      )
      return {
        ciphertext: Buffer.from(ciphertext).toString('base64'),
        iv: Buffer.from(iv).toString('base64'),
      }
    }
    const [swid, s2] = await Promise.all([legacy(SWID), legacy(S2)])
    await opened().db.insert(espnAccounts).values({
      viewerId: 'u1',
      swidCiphertext: swid.ciphertext,
      swidIv: swid.iv,
      s2Ciphertext: s2.ciphertext,
      s2Iv: s2.iv,
      status: 'ok',
      connectedAt: '2026-10-08T00:00:00Z',
    })
    const { loadSession } =
      await vi.importActual<typeof FantasySync>('@/lib/fantasy/sync')

    expect(await loadSession(state.env, 'u1')).toEqual({
      swid: SWID,
      espnS2: S2,
    })
    const row = (await opened().db.select().from(espnAccounts).get())!
    const swidSealed = { ciphertext: row.swidCiphertext, iv: row.swidIv }
    const s2Sealed = { ciphertext: row.s2Ciphertext, iv: row.s2Iv }
    expect(isLegacy(swidSealed) || isLegacy(s2Sealed)).toBe(false)
    expect(
      await unseal(SECRET, swidSealed, {
        purpose: 'espn-swid',
        viewerId: 'u1',
      }),
    ).toBe(SWID)
    expect(
      await unseal(SECRET, s2Sealed, { purpose: 'espn-s2', viewerId: 'u1' }),
    ).toBe(S2)
    // Opens the same way next time.
    expect(await loadSession(state.env, 'u1')).toEqual({
      swid: SWID,
      espnS2: S2,
    })
  })

  it('turns away an espn_s2 with a broken escape', async () => {
    const connected = await call('connectEspn', {
      swid: SWID,
      espnS2: `AE${'b'.repeat(60)}%E0%A4%A`,
    })
    expect(message(connected.error)).toContain('espn_s2')
    expect(await opened().db.select().from(espnAccounts)).toHaveLength(0)
  })

  it('disconnects ESPN all at once, or not at all', async () => {
    await call('connectEspn', { swid: SWID, espnS2: S2 })
    await league('espn-1', 'espn')
    await league('sleeper-1', 'sleeper')
    opened().sqlite.run(
      "CREATE TRIGGER stuck BEFORE DELETE ON espn_accounts BEGIN SELECT RAISE(ABORT, 'stuck'); END",
    )
    expect((await call('disconnectEspn')).error).toBeTruthy()
    expect(await opened().db.select().from(fantasyLeagues)).toHaveLength(2)

    opened().sqlite.run('DROP TRIGGER stuck')
    expect((await call('disconnectEspn')).error).toBeUndefined()
    expect(
      (await opened().db.select().from(fantasyLeagues)).map((l) => l.id),
    ).toEqual(['sleeper-1'])
    expect(await opened().db.select().from(espnAccounts)).toHaveLength(0)
  })

  it('disconnects Sleeper all at once, or not at all', async () => {
    await opened().db.insert(sleeperAccounts).values({
      viewerId: 'u1',
      username: 'v',
      userId: 's1',
      status: 'ok',
      connectedAt: '2026-10-08T00:00:00Z',
    })
    await league('sleeper-1', 'sleeper')
    opened().sqlite.run(
      "CREATE TRIGGER stuck BEFORE DELETE ON sleeper_accounts BEGIN SELECT RAISE(ABORT, 'stuck'); END",
    )
    expect((await call('disconnectSleeper')).error).toBeTruthy()
    expect(await opened().db.select().from(fantasyLeagues)).toHaveLength(1)

    opened().sqlite.run('DROP TRIGGER stuck')
    expect((await call('disconnectSleeper')).error).toBeUndefined()
    expect(await opened().db.select().from(fantasyLeagues)).toHaveLength(0)
    expect(await opened().db.select().from(sleeperAccounts)).toHaveLength(0)
  })

  it('reorders leagues all at once, or not at all', async () => {
    await league('a', 'espn')
    await league('b', 'espn')
    await league('c', 'espn')
    const order = async () =>
      (await opened().db.select().from(fantasyLeagues))
        .sort((x, y) => (x.position ?? 99) - (y.position ?? 99))
        .map((l) => [l.id, l.position])

    await call('reorderFantasyLeagues', { ids: ['c', 'a', 'b'] })
    expect(await order()).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ])

    opened().sqlite.run(
      "CREATE TRIGGER stuck BEFORE UPDATE ON fantasy_leagues WHEN NEW.id = 'c' BEGIN SELECT RAISE(ABORT, 'stuck'); END",
    )
    expect(
      (await call('reorderFantasyLeagues', { ids: ['a', 'b', 'c'] })).error,
    ).toBeTruthy()
    expect(await order()).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ])
  })

  it('offers an open Who Has? once, then keeps the Viewer’s record', async () => {
    await league('espn-1', 'espn')
    const encounter = (id: string, createdAt: string) => ({
      id,
      viewerId: 'u1',
      leagueRowId: 'espn-1',
      player: {
        espnId: 1,
        name: 'Josh Allen',
        positionId: 1,
        proTeamId: 2,
      },
      status: 'OUT',
      ownerTeamId: 3,
      options: [
        { teamId: 3, name: 'Owner' },
        { teamId: 4, name: 'Decoy' },
      ],
      createdAt,
    })
    await opened()
      .db.insert(whoHas)
      .values([
        encounter('fresh', new Date().toISOString()),
        // Past its window: never offered.
        encounter('stale', '2026-01-01T00:00:00Z'),
      ])
    type Got = Awaited<ReturnType<typeof caller.getWhoHas>>
    const got = await call<Got>('getWhoHas')
    expect(got.result?.encounter).toMatchObject({
      id: 'fresh',
      sport: 'football',
      leagueName: 'espn-1',
      status: 'OUT',
    })
    expect(got.result?.record).toEqual({ right: 0, answered: 0 })

    type Answer = Awaited<ReturnType<typeof caller.answerWhoHas>>
    const answered = await call<Answer>('answerWhoHas', {
      id: 'fresh',
      teamId: 3,
    })
    expect(answered.result).toEqual({
      ownerTeamId: 3,
      record: { right: 1, answered: 1 },
    })
    // Answered once: a second answer doesn't change it.
    await call('answerWhoHas', { id: 'fresh', teamId: 4 })
    expect((await call<Got>('getWhoHas')).result).toEqual({
      encounter: null,
      record: { right: 1, answered: 1 },
    })
  })

  it('passes on a Who Has? with no guess, outside the record', async () => {
    await league('espn-1', 'espn')
    await opened()
      .db.insert(whoHas)
      .values({
        id: 'pass',
        viewerId: 'u1',
        leagueRowId: 'espn-1',
        player: { espnId: 1, name: 'Josh Allen', positionId: 1, proTeamId: 2 },
        status: 'OUT',
        ownerTeamId: 3,
        options: [{ teamId: 3, name: 'Owner' }],
        createdAt: new Date().toISOString(),
      })
    await call('answerWhoHas', { id: 'pass', teamId: null })
    type Got = Awaited<ReturnType<typeof caller.getWhoHas>>
    expect((await call<Got>('getWhoHas')).result).toEqual({
      encounter: null,
      record: { right: 0, answered: 0 },
    })
  })
})
