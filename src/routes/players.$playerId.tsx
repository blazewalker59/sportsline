import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { PlayerScreen } from '@/components/players/PlayerScreen'

export const Route = createFileRoute('/players/$playerId')({
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
