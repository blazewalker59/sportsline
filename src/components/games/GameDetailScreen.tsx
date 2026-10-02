import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { AppHeader } from '@/components/layout/AppHeader'
import { getGameDetail } from '@/lib/games/server'
import { gameSearch } from '@/lib/timeline/gameLink'

/**
 * Old Game Detail links (/games/:id) open the Game inside the Timeline,
 * where tapping a game filters the group chat to it.
 */
export function GameDetailScreen({ gameId }: { gameId: string }) {
  const navigate = useNavigate()
  const { data, isPending } = useQuery({
    queryKey: ['game', gameId],
    queryFn: () => getGameDetail({ data: { gameId } }),
  })
  useEffect(() => {
    if (data) {
      void navigate({
        to: '/',
        search: gameSearch(gameId, data.game.sportsDay),
        replace: true,
      })
    }
  }, [data, gameId, navigate])
  return (
    <div className="mx-auto max-w-xl px-4">
      <AppHeader />
      {!isPending && !data && (
        <p className="mt-16 text-center text-sm text-muted">Game not found.</p>
      )}
    </div>
  )
}
