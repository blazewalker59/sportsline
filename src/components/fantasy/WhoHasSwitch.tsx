/**
 * Who Has? for one league (CONTEXT.md, "Who Has?"), off until the Viewer
 * opts in: then its Injury Events pop up as guesses when the app opens.
 */

import { useSetFantasyLeagueWhoHas } from '@/lib/fantasy/useFantasy'
import { cn } from '@/lib/utils'

export function WhoHasSwitch({
  leagueId,
  on,
}: {
  leagueId: string
  on: boolean
}) {
  const set = useSetFantasyLeagueWhoHas(leagueId)
  // Shows the choice at once, while it saves.
  const shown = set.isPending ? set.variables : on
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      disabled={set.isPending}
      onClick={() => set.mutate(!on)}
      className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Who Has?</span>
        <span className="block text-xs text-muted">
          {shown
            ? 'On. When a notable player in this league gets hurt, guess which team has them next time you open the app.'
            : 'Off. Turn on to guess which team has a notable player in this league when they get hurt.'}
        </span>
        {set.error && (
          <span role="alert" className="block text-xs text-live">
            {set.error.message}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          shown ? 'bg-accent' : 'bg-notice',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform',
            shown ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}
