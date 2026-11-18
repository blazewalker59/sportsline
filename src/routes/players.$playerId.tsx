import { createFileRoute, notFound } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { NotFoundPanel, RouteErrorPanel } from '@/components/layout/RouteStates'
import { PlayerScreen } from '@/components/players/PlayerScreen'
import { playerDetailQuery, playerPagesQuery } from '@/lib/players/queries'
import { warm } from '@/lib/routeLoad'

export const Route = createFileRoute('/players/$playerId')({
  // Only warms the cache in the browser (the screen shows its own loading),
  // so there's no pendingComponent. Where the read has already answered
  // (always on the server), no such Player is a not-found.
  loader: async ({ context, params: { playerId } }) => {
    if (!context.viewerState?.viewer) return
    const { queryClient } = context
    const pages = playerPagesQuery(playerId)
    await warm(
      Promise.all([
        queryClient.prefetchInfiniteQuery(pages),
        queryClient.prefetchQuery(playerDetailQuery(playerId)),
      ]),
    )
    if (queryClient.getQueryData(pages.queryKey)?.pages[0] === null)
      throw notFound()
  },
  validateSearch: z.object({
    /** A Play whose detail is open in a sheet over the page. */
    play: z.catch(z.optional(z.string().check(z.maxLength(240))), undefined),
  }),
  component: function PlayerRoute() {
    const { playerId } = Route.useParams()
    const { play } = Route.useSearch()
    return <PlayerScreen playerId={playerId} playId={play ?? null} />
  },
  errorComponent: RouteErrorPanel,
  notFoundComponent: () => <NotFoundPanel what="player" />,
})
