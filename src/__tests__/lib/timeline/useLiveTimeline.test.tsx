// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeSocket } from '../../helpers/fakeSocket'
import type { InfiniteData } from '@tanstack/react-query'
import type { GameDetail } from '@/lib/games/server'
import type { TimelinePage } from '@/lib/timeline/server'
import type { Follow, GameSummary, TimelineItem } from '@/lib/model/timeline'
import { followsToParam } from '@/lib/model/timeline'
import { gameKey } from '@/lib/games/queries'
import { gamesKey, timelineKey } from '@/lib/timeline/queries'
import {
  applyLiveEvents,
  useLiveTimeline,
} from '@/lib/timeline/useLiveTimeline'

vi.mock('@/lib/timeline/server', () => ({
  getTimeline: vi.fn(({ data }: { data: { sportsDay: string } }) =>
    Promise.resolve({ sportsDay: data.sportsDay, items: [], nextBefore: null }),
  ),
  getGames: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/lib/games/server', () => ({
  getGameDetail: vi.fn(() => Promise.resolve(null)),
  getPlayDetail: vi.fn(() => Promise.resolve(null)),
}))

const DAY = '2026-10-01'
const MLB: Array<Follow> = [{ kind: 'league', league: 'mlb' }]
const NHL: Array<Follow> = [{ kind: 'league', league: 'nhl' }]

function item(id: string, overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id,
    gameId: 'g1',
    league: 'mlb',
    sportsDay: DAY,
    kind: 'play',
    side: 'away',
    sequence: 1,
    occurredAt: '2026-10-01T23:00:00Z',
    segmentLabel: 'Top 1st',
    score: { away: 0, home: 0 },
    awayTeam: { id: 'a', abbreviation: 'PHI', logoUrl: null },
    homeTeam: { id: 'h', abbreviation: 'ATL', logoUrl: null },
    description: id,
    playType: 'single',
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

function game(id: string, overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    id,
    league: 'mlb',
    sportsDay: DAY,
    status: 'live',
    startsAt: '2026-10-01T22:00:00Z',
    awayTeam: { id: 'a', abbreviation: 'PHI', name: 'Phillies', logoUrl: null },
    homeTeam: { id: 'h', abbreviation: 'ATL', name: 'Braves', logoUrl: null },
    score: { away: 0, home: 0 },
    situation: null,
    ...overrides,
  }
}

const page = (items: Array<TimelineItem>) => ({
  pages: [{ sportsDay: DAY, items, nextBefore: null }],
  pageParams: [null],
})

type Pages = InfiniteData<TimelinePage, string | null>
const pageIds = (qc: QueryClient, follows: Array<Follow>) =>
  qc
    .getQueryData<Pages>(timelineKey(DAY, followsToParam(follows)))
    ?.pages.flatMap((p) => p.items.map((i) => i.id))

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
}

describe('applyLiveEvents', () => {
  it('gives each cached Scope only the plays its Follows cover', () => {
    const qc = client()
    qc.setQueryData(timelineKey(DAY, followsToParam(MLB)), page([]))
    qc.setQueryData(timelineKey(DAY, followsToParam(NHL)), page([]))

    applyLiveEvents(qc, DAY, [
      { type: 'upsert', item: item('mlb-1') },
      { type: 'upsert', item: item('nhl-1', { league: 'nhl' }) },
    ])

    expect(pageIds(qc, MLB)).toEqual(['mlb-1'])
    expect(pageIds(qc, NHL)).toEqual(['nhl-1'])
  })

  it('removes a play from every Scope', () => {
    const qc = client()
    qc.setQueryData(timelineKey(DAY, followsToParam(MLB)), page([item('p1')]))
    applyLiveEvents(qc, DAY, [{ type: 'remove', id: 'p1', gameId: 'g1' }])
    expect(pageIds(qc, MLB)).toEqual([])
  })

  it("keeps the day's Games current, and only that day's", () => {
    const qc = client()
    qc.setQueryData(gamesKey(DAY), [game('g1', { status: 'scheduled' })])

    applyLiveEvents(qc, DAY, [
      { type: 'game', game: game('g1') },
      { type: 'game', game: game('g2') },
      { type: 'game', game: game('g3', { sportsDay: '2026-10-02' }) },
    ])

    const games = qc.getQueryData<Array<GameSummary>>(gamesKey(DAY))
    expect(games?.map((g) => [g.id, g.status])).toEqual([
      ['g1', 'live'],
      ['g2', 'live'],
    ])
  })

  it('hands an open Game its own plays and Situation', () => {
    const qc = client()
    const detail: GameDetail = {
      game: game('g1', { status: 'scheduled' }),
      box: null,
      items: [item('p1', { sequence: 1 })],
    }
    qc.setQueryData(gameKey('g1'), detail)

    applyLiveEvents(qc, DAY, [
      { type: 'upsert', item: item('p2', { sequence: 2 }) },
      { type: 'upsert', item: item('other', { gameId: 'g9' }) },
      { type: 'game', game: game('g1') },
    ])

    const next = qc.getQueryData<GameDetail>(gameKey('g1'))
    expect(next?.items.map((i) => i.id)).toEqual(['p1', 'p2'])
    expect(next?.game.status).toBe('live')
    // A Game nobody opened isn't cached on the socket's account.
    expect(qc.getQueryData(gameKey('g9'))).toBeUndefined()
  })
})

describe('useLiveTimeline', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    FakeSocket.reset()
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function render(qc: QueryClient, sportsDay: string, today: string) {
    return renderHook(() => useLiveTimeline(MLB, sportsDay, today), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    })
  }

  it("routes today's socket events into the cache", async () => {
    const qc = client()
    const { result } = render(qc, DAY, DAY)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(FakeSocket.all).toHaveLength(1)

    act(() => FakeSocket.latest.open())
    act(() => FakeSocket.latest.message([{ type: 'upsert', item: item('p1') }]))

    await waitFor(() =>
      expect(result.current.items.map((i) => i.id)).toEqual(['p1']),
    )
    expect(result.current.connection).toBe('live')
  })

  it('opens no socket for a past day', async () => {
    const qc = client()
    const { result } = render(qc, '2026-09-30', DAY)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(FakeSocket.all).toHaveLength(0)
  })

  it("refetches the day's pages, Games and open Games after a reconnect", async () => {
    const qc = client()
    qc.setQueryData(gameKey('g1'), null)
    const { result } = render(qc, DAY, DAY)
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => FakeSocket.latest.open())

    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    act(() => FakeSocket.latest.drop())
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    act(() => FakeSocket.latest.open())

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
    expect(keys).toEqual(
      expect.arrayContaining([['timeline', DAY], gamesKey(DAY), ['game']]),
    )
  })
})
