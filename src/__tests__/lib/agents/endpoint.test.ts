/**
 * /mcp end to end, in process: the real migrations on an in-memory SQLite
 * (Bun's), a real token, and JSON-RPC over Requests. Bun only.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { CloudflareEnv } from '@/lib/db'
import type * as Db from '@/lib/db'
import type { serveMcp as ServeMcp } from '@/lib/agents/endpoint'

const state = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => state.db,
}))
vi.mock('@/lib/ops/errors', () => ({ reportError: () => Promise.resolve() }))

const isBun = Boolean(process.versions.bun)
const URL_ = 'https://sportsline.dev/mcp'
const env = { DB: {} } as CloudflareEnv
let token = ''

async function freshDb() {
  // Hidden from Vite's import analysis: Node has no bun:sqlite.
  const bunSqlite = 'bun:sqlite'
  const { Database } = await import(/* @vite-ignore */ bunSqlite)
  const { drizzle } = await import('drizzle-orm/bun-sqlite')
  const schema = await import('@/lib/db/schema')
  const sqlite = new Database(':memory:')
  const dir = join(process.cwd(), 'drizzle')
  const journal = JSON.parse(
    readFileSync(join(dir, 'meta/_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string }> }
  for (const { tag } of journal.entries) {
    const sql = readFileSync(join(dir, `${tag}.sql`), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) sqlite.run(statement)
    }
  }
  return { sqlite, db: drizzle(sqlite, { schema }) }
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(URL_, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe.skipIf(!isBun)('/mcp', () => {
  let serveMcp: typeof ServeMcp

  beforeAll(async () => {
    const { sqlite, db } = await freshDb()
    state.db = db
    sqlite.run(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u1','Test','t@example.com',1,0,0)",
    )
    sqlite.run(
      `INSERT INTO sharp_picks (id,day,rank,kind,league,game_id,starts_at,market_ticker,side,market_kind,title,game_label,fair,price,fee,edge,ev_per_dollar,grade,sources,closing_price,result,created_at)
       VALUES ('2026-10-07:1','2026-10-07',1,'single','nhl','gm_1','2026-10-08T02:00:00Z','KXNHLGAME-26OCT07EDMANA-EDM','yes','moneyline','EDM win','EDM @ ANA',0.585,0.54,0.02,0.025,0.0446,'edge','[]',0.57,'won','2026-10-07T14:00:00Z')`,
    )
    const { createToken } = await import('@/lib/agents/tokens')
    token = (await createToken(db as never, 'u1', 'Grok')).token
    ;({ serveMcp } = await import('@/lib/agents/endpoint'))
  })

  it('turns away a request without a valid token', async () => {
    const none = await serveMcp(post({}, { authorization: '' }), env)
    expect(none.status).toBe(401)
    expect(none.headers.get('www-authenticate')).toMatch(/^Bearer/)
    const wrong = await serveMcp(
      post({}, { authorization: 'Bearer sl_not-a-real-token' }),
      env,
    )
    expect(wrong.status).toBe(401)
  })

  it('refuses other methods and other sites', async () => {
    const get = await serveMcp(new Request(URL_), env)
    expect(get.status).toBe(405)
    const foreign = await serveMcp(
      post({}, { origin: 'https://evil.example' }),
      env,
    )
    expect(foreign.status).toBe(403)
  })

  it('initializes, then acknowledges the initialized notification', async () => {
    const init = await serveMcp(
      post({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      }),
      env,
    )
    expect(init.status).toBe(200)
    expect(await init.json()).toMatchObject({
      result: {
        protocolVersion: '2025-06-18',
        serverInfo: { name: 'sportsline' },
      },
    })
    const note = await serveMcp(
      post({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      env,
    )
    expect(note.status).toBe(202)
  })

  it("serves the day's Sharp picks and the record", async () => {
    const picks = await serveMcp(
      post({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_sharp_picks', arguments: { day: '2026-10-07' } },
      }),
      env,
    )
    expect(await picks.json()).toMatchObject({
      result: {
        structuredContent: {
          day: '2026-10-07',
          picks: [{ pick: 'EDM win', priceCents: 54, edgePoints: 2.5 }],
        },
      },
    })
    const record = await serveMcp(
      post({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_sharp_record', arguments: {} },
      }),
      env,
    )
    expect(await record.json()).toMatchObject({
      result: {
        structuredContent: {
          all: { picks: 1, won: 1, lost: 0, beatTheClose: 1 },
        },
      },
    })
  })

  it('answers a body that isn’t JSON with a parse error', async () => {
    const bad = await serveMcp(
      new Request(URL_, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: '{nope',
      }),
      env,
    )
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ error: { code: -32700 } })
  })
})
