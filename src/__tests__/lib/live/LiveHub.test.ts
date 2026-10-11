/**
 * LiveHub fan-out: one socket per Viewer, events filtered by their Follows.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installWebSocketGlobals, memoryCtx } from '../../helpers/durable'
import type { FakeSocket, MemoryCtx } from '../../helpers/durable'
import type { LiveHub as LiveHubClass } from '@/lib/live/LiveHub'
import type { TimelineEvent, TimelineItem } from '@/lib/model/timeline'

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

function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'gm_1~p1',
    gameId: 'gm_1',
    league: 'mlb',
    sportsDay: '2026-10-08',
    kind: 'play',
    side: 'away',
    sequence: 1,
    occurredAt: '2026-10-08T18:00:00.000Z',
    segmentLabel: 'Top 1st',
    score: { away: 0, home: 0 },
    awayTeam: {
      id: 'tm_away',
      abbreviation: 'NYY',
      logoUrl: null,
      colors: null,
      rank: null,
      conference: null,
    },
    homeTeam: {
      id: 'tm_home',
      abbreviation: 'BOS',
      logoUrl: null,
      colors: null,
      rank: null,
      conference: null,
    },
    description: 'Groundout',
    playType: 'field_out',
    significance: 'routine',
    milestone: null,
    status: 'active',
    revisedAt: null,
    overturnOf: null,
    players: [],
    detail: null,
    ...overrides,
  }
}

describe('LiveHub', () => {
  let LiveHub: typeof LiveHubClass
  let ctx: MemoryCtx
  let hub: InstanceType<typeof LiveHubClass>

  beforeEach(async () => {
    installWebSocketGlobals()
    ctx = memoryCtx()
    ;({ LiveHub } = await import('@/lib/live/LiveHub'))
    hub = new LiveHub(ctx as never, {} as never)
  })

  function connect(path: string): FakeSocket {
    const response = hub.fetch(
      new Request(`https://sportsline.test${path}`, {
        headers: { Upgrade: 'websocket' },
      }),
    )
    expect(response.status).toBe(101)
    const server = ctx.sockets.at(-1)
    if (!server) throw new Error('socket was not accepted')
    return server
  }

  it('refuses a request that is not a WebSocket', () => {
    const response = hub.fetch(new Request('https://sportsline.test/live'))
    expect(response.status).toBe(426)
    expect(ctx.sockets).toHaveLength(0)
  })

  it('forwards each socket only the events its filter covers', () => {
    const yankees = connect('/live?follows=team:tm_away')
    const routine = connect('/live?follows=league:mlb&routine=1')
    const scores = connect('/live?follows=league:mlb')
    const oneGame = connect('/live?game=gm_1&follows=league:mlb')
    const other = connect('/live?game=gm_other')
    const silent = connect('/live?follows=team:tm_away')
    silent.serializeAttachment(null)

    const events: Array<TimelineEvent> = [
      {
        type: 'game',
        game: {
          id: 'gm_1',
          league: 'mlb',
          sportsDay: '2026-10-08',
          status: 'live',
          startsAt: '2026-10-08T17:00:00.000Z',
          awayTeam: {
            id: 'tm_away',
            abbreviation: 'NYY',
            logoUrl: null,
            name: 'Yankees',
          },
          homeTeam: {
            id: 'tm_home',
            abbreviation: 'BOS',
            logoUrl: null,
            name: 'Red Sox',
          },
          score: { away: 0, home: 0 },
          situation: null,
        },
      },
      { type: 'upsert', item: item() },
      {
        type: 'upsert',
        item: item({
          id: 'gm_1~hr',
          significance: 'scoring',
          description: 'HR',
        }),
      },
      { type: 'remove', id: 'gm_1~old', gameId: 'gm_1' },
    ]
    hub.publish(events)
    hub.publish([])

    expect(JSON.parse(yankees.sent[0] ?? '[]')).toHaveLength(4)
    const routineSent = JSON.parse(routine.sent[0] ?? '[]') as Array<{
      type: string
    }>
    expect(routineSent.filter((event) => event.type === 'upsert')).toHaveLength(
      2,
    )
    const scoreSent = JSON.parse(scores.sent[0] ?? '[]') as Array<{
      type: string
      item?: { significance: string }
    }>
    expect(
      scoreSent
        .filter((event) => event.type === 'upsert')
        .map((event) => event.item?.significance),
    ).toEqual(['scoring'])
    expect(JSON.parse(oneGame.sent[0] ?? '[]')).toHaveLength(4)
    expect(other.sent).toEqual([])
    expect(silent.sent).toEqual([])

    yankees.failSend = true
    hub.publish(events)
    expect(yankees.sent).toHaveLength(1)
  })

  it('answers a close with a code it is allowed to send', () => {
    const socket = connect('/live')
    hub.webSocketClose(socket as unknown as WebSocket, 1005)
    hub.webSocketClose(socket as unknown as WebSocket, 1001)
    expect(socket.closed).toEqual([
      { code: 1000, reason: 'closing' },
      { code: 1001, reason: 'closing' },
    ])
  })
})
