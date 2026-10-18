import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { PlayerScreen } from '@/components/players/PlayerScreen'
import { playerDetailQuery, playerPagesQuery } from '@/lib/players/queries'
import { warm } from '@/lib/routeLoad'

export const Route = createFileRoute('/players/$playerId')({
  loader: ({ context, params: { playerId } }) => {
    if (!context.viewerState?.viewer) return
    const { queryClient } = context
    return warm(
      Promise.all([
        queryClient.prefetchInfiniteQuery(playerPagesQuery(playerId)),
        queryClient.prefetchQuery(playerDetailQuery(playerId)),
      ]),
    )
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
})
