import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { TimelineScreen } from '@/components/timeline/TimelineScreen'
import { readStoredScope } from '@/components/timeline/timelineScope'
import { gameDetailQuery } from '@/lib/games/queries'
import { parseScope } from '@/lib/model/scope'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { warm } from '@/lib/routeLoad'
import { openingFollowParam, prefetchTimeline } from '@/lib/timeline/queries'

/** An optional string param; anything malformed is dropped, not an error. */
const optional = (max: number) =>
  z.catch(z.optional(z.string().check(z.maxLength(max))), undefined)

// zod/mini: these schemas sit in the app's entry chunk, and the classic
// API's chained methods can't be tree-shaken.
const search = z.object({
  /** A past Sports Day to show instead of today (YYYY-MM-DD). */
  day: z.catch(
    z.optional(z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/))),
    undefined,
  ),
  /** Filter the Timeline to one Game (its thread and box score). */
  game: optional(200),
  /** Which Plays to draw from: all, following, or a League code. */
  scope: z.catch(
    z.pipe(
      z.optional(z.string()),
      z.transform((v) => parseScope(v)),
    ),
    undefined,
  ),
  /** A Play whose detail is open in a sheet over the Timeline. */
  play: optional(240),
  /** Narrow the Timeline to one Prediction's Games and Players. */
  prediction: optional(400),
  /** Narrow the Timeline to one Fantasy Matchup's Starters (its league row). */
  matchup: optional(200),
})

export const Route = createFileRoute('/')({
  validateSearch: search,
  loaderDeps: ({ search: { day, game, scope, prediction, matchup } }) => ({
    day,
    game,
    scope,
    narrowed: Boolean(prediction || matchup),
  }),
  // The day's opening Timeline, its Games and any open Game, so the server
  // renders the feed rather than a loading state.
  loader: ({ context, deps }) => {
    if (!context.viewerState?.viewer) return
    const today = sportsDayOf(new Date())
    const sportsDay = deps.day && deps.day < today ? deps.day : today
    // A Prediction or Matchup narrows to what only loads in the browser.
    const followParam = deps.narrowed
      ? null
      : openingFollowParam(context.viewerState, deps.scope ?? readStoredScope())
    const { queryClient } = context
    return warm(
      Promise.all([
        prefetchTimeline(queryClient, sportsDay, followParam),
        deps.game && queryClient.prefetchQuery(gameDetailQuery(deps.game)),
      ]),
    )
  },
  component: function TimelineRoute() {
    const { day, game, scope, play, prediction, matchup } = Route.useSearch()
    return (
      <TimelineScreen
        day={day}
        gameId={game}
        scope={scope}
        playId={play}
        predictionId={prediction}
        matchupId={matchup}
      />
    )
  },
})
