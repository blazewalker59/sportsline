import { QueryClient } from '@tanstack/react-query'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'
import { Route as GameRoute } from '@/routes/games.$gameId'
import { Route as PlayRoute } from '@/routes/plays.$playId'
import { Route as PlayerRoute } from '@/routes/players.$playerId'
import { Route as TeamRoute } from '@/routes/teams.$teamId'
import { Route as LeagueRoute } from '@/routes/fantasy_.$leagueId'
import { fantasyLeagueQuery } from '@/lib/fantasy/leagueQuery'
import { gameKey } from '@/lib/games/queries'
import { playerPagesQuery } from '@/lib/players/queries'
import { teamPageQuery } from '@/lib/teams/queries'

/**
 * Each loader's verdict, from a cache seeded with what the server answered:
 * null (no such thing) is a not-found; a failed read is an error, which the
 * route's error panel offers again.
 */

type Loader = (ctx: unknown) => Promise<unknown>

const loaderOf = (route: { options: unknown }) =>
  (route.options as { loader: Loader }).loader

function call(
  route: { options: unknown },
  params: Record<string, string>,
  queryClient: QueryClient,
) {
  return loaderOf(route)({
    context: { queryClient, viewerState: { viewer: { id: 'v1' } } },
    params,
  })
}

async function verdict(promise: Promise<unknown>) {
  try {
    await promise
    return 'loaded'
  } catch (e) {
    if (isNotFound(e)) return 'notFound'
    if (isRedirect(e)) return 'redirect'
    throw e
  }
}

const client = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })

describe('/games/$gameId loader', () => {
  it('is not found when there is no such Game', async () => {
    const qc = client()
    qc.setQueryData(gameKey('nope'), null)
    expect(await verdict(call(GameRoute, { gameId: 'nope' }, qc))).toBe(
      'notFound',
    )
  })

  it('opens a real Game in the Timeline', async () => {
    const qc = client()
    qc.setQueryData(gameKey('g1'), { game: { sportsDay: '2026-11-17' } })
    expect(await verdict(call(GameRoute, { gameId: 'g1' }, qc))).toBe(
      'redirect',
    )
  })

  it('fails (not a not-found) when the read fails', async () => {
    const qc = client()
    vi.spyOn(qc, 'ensureQueryData').mockRejectedValue(new Error('D1 down'))
    await expect(call(GameRoute, { gameId: 'g1' }, qc)).rejects.toThrow(
      'D1 down',
    )
  })
})

describe('/plays/$playId loader', () => {
  it('is not found when there is no such Play', async () => {
    const qc = client()
    qc.setQueryData(['play', 'nope'], null)
    expect(await verdict(call(PlayRoute, { playId: 'nope' }, qc))).toBe(
      'notFound',
    )
  })

  it('fails (not a not-found) when the read fails', async () => {
    const qc = client()
    vi.spyOn(qc, 'ensureQueryData').mockRejectedValue(new Error('D1 down'))
    await expect(call(PlayRoute, { playId: 'p1' }, qc)).rejects.toThrow(
      'D1 down',
    )
  })
})

describe('/teams/$teamId loader', () => {
  it('is not found once the read says there is no such Team', async () => {
    const qc = client()
    qc.setQueryData(teamPageQuery('nope').queryKey, null)
    expect(await verdict(call(TeamRoute, { teamId: 'nope' }, qc))).toBe(
      'notFound',
    )
  })

  it('loads when the Team is there', async () => {
    const qc = client()
    qc.setQueryData(teamPageQuery('t1').queryKey, {} as never)
    expect(await verdict(call(TeamRoute, { teamId: 't1' }, qc))).toBe('loaded')
  })
})

describe('/fantasy_/$leagueId loader', () => {
  it('is not found when the Viewer has no such Fantasy league', async () => {
    const qc = client()
    qc.setQueryData(fantasyLeagueQuery('nope').queryKey, null)
    expect(await verdict(call(LeagueRoute, { leagueId: 'nope' }, qc))).toBe(
      'notFound',
    )
  })

  it('loads when the Fantasy league is theirs', async () => {
    const qc = client()
    qc.setQueryData(fantasyLeagueQuery('l1').queryKey, {} as never)
    expect(await verdict(call(LeagueRoute, { leagueId: 'l1' }, qc))).toBe(
      'loaded',
    )
  })
})

describe('/players/$playerId loader', () => {
  it('is not found once the read says there is no such Player', async () => {
    const qc = client()
    qc.setQueryData(playerPagesQuery('nope').queryKey, {
      pages: [null],
      pageParams: [undefined],
    })
    qc.setQueryData(['player-detail', 'nope'], null)
    expect(await verdict(call(PlayerRoute, { playerId: 'nope' }, qc))).toBe(
      'notFound',
    )
  })

  it('loads when the Player is there', async () => {
    const qc = client()
    qc.setQueryData(playerPagesQuery('p1').queryKey, {
      pages: [{} as never],
      pageParams: [undefined],
    })
    qc.setQueryData(['player-detail', 'p1'], null)
    expect(await verdict(call(PlayerRoute, { playerId: 'p1' }, qc))).toBe(
      'loaded',
    )
  })
})
