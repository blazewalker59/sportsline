import { createFileRoute } from '@tanstack/react-router'
import { PlayDetailScreen } from '@/components/games/PlayDetailScreen'

export const Route = createFileRoute('/plays/$playId')({
  component: function PlayRoute() {
    const { playId } = Route.useParams()
    return <PlayDetailScreen key={playId} playId={playId} />
  },
})
