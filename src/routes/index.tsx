import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { TimelineScreen } from '@/components/timeline/TimelineScreen'

const search = z.object({
  /** A past Sports Day to show instead of today (YYYY-MM-DD). */
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  /** Filter the Timeline to one Game (its thread and box score). */
  game: z.string().max(200).optional().catch(undefined),
})

export const Route = createFileRoute('/')({
  validateSearch: search,
  component: function TimelineRoute() {
    const { day, game } = Route.useSearch()
    return <TimelineScreen day={day} gameId={game} />
  },
})
