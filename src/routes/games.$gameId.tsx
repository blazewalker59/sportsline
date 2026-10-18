import { createFileRoute, redirect } from '@tanstack/react-router'
import { GameDetailScreen } from '@/components/games/GameDetailScreen'
import { gameDetailQuery } from '@/lib/games/queries'
import { gameSearch } from '@/lib/timeline/gameLink'

export const Route = createFileRoute('/games/$gameId')({
  // Old Game Detail links open the Game inside the Timeline: read it (which
  // leaves it cached for the Timeline) and go straight there.
  loader: async ({ context, params: { gameId } }) => {
    if (!context.viewerState?.viewer) return
    const detail = await context.queryClient.ensureQueryData(
      gameDetailQuery(gameId),
    )
    if (detail)
      throw redirect({
        to: '/',
        search: gameSearch(gameId, detail.game.sportsDay),
        replace: true,
      })
  },
  component: function GameRoute() {
    const { gameId } = Route.useParams()
    return <GameDetailScreen gameId={gameId} />
  },
})
