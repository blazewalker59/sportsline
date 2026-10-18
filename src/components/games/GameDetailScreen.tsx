import { Navigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AppHeader } from '@/components/layout/AppHeader'
import { gameDetailQuery } from '@/lib/games/queries'
import { gameSearch } from '@/lib/timeline/gameLink'

/**
 * Old Game Detail links (/games/:id) open the Game inside the Timeline,
 * where tapping a game filters the group chat to it. The route's loader
 * redirects before this renders; it shows only when there's no such Game.
 */
export function GameDetailScreen({ gameId }: { gameId: string }) {
  const { data, isPending } = useQuery(gameDetailQuery(gameId))
  if (data)
    return (
      <Navigate
        to="/"
        search={gameSearch(gameId, data.game.sportsDay)}
        replace
      />
    )
  return (
    <div className="mx-auto max-w-xl px-4">
      <AppHeader />
      {!isPending && (
        <p className="mt-16 text-center text-sm text-muted">Game not found.</p>
      )}
    </div>
  )
}
