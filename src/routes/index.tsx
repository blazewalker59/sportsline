import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { TimelineScreen } from '@/components/timeline/TimelineScreen'
import { parseScope } from '@/lib/model/scope'

const search = z.object({
  /** A past Sports Day to show instead of today (YYYY-MM-DD). */
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  /** Filter the Timeline to one Game (its thread and box score). */
  game: z.string().max(200).optional().catch(undefined),
  /** Which Plays to draw from: all, following, or a League code. */
  scope: z
    .string()
    .optional()
    .transform((v) => parseScope(v))
    .catch(undefined),
  /** A Play whose detail is open in a sheet over the Timeline. */
  play: z.string().max(240).optional().catch(undefined),
  /** Narrow the Timeline to one Prediction's Games and Players. */
  prediction: z.string().max(400).optional().catch(undefined),
})

export const Route = createFileRoute('/')({
  validateSearch: search,
  component: function TimelineRoute() {
    const { day, game, scope, play, prediction } = Route.useSearch()
    return (
      <TimelineScreen
        day={day}
        gameId={game}
        scope={scope}
        playId={play}
        predictionId={prediction}
      />
    )
  },
})
