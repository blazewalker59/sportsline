import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { ReactionsScreen } from '@/components/reactions/ReactionsScreen'

export const Route = createFileRoute('/reactions')({
  validateSearch: z.object({
    /** A Play whose detail is open in a sheet over the list. */
    play: z.catch(z.optional(z.string().check(z.maxLength(240))), undefined),
  }),
  component: function ReactionsRoute() {
    const { play } = Route.useSearch()
    return <ReactionsScreen playId={play ?? null} />
  },
})
