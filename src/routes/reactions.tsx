import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ReactionsScreen } from '@/components/reactions/ReactionsScreen'

export const Route = createFileRoute('/reactions')({
  validateSearch: z.object({
    /** A Play whose detail is open in a sheet over the list. */
    play: z.string().max(240).optional().catch(undefined),
  }),
  component: function ReactionsRoute() {
    const { play } = Route.useSearch()
    return <ReactionsScreen playId={play ?? null} />
  },
})
