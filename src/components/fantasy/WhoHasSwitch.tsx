/**
 * Who Has? for one league (CONTEXT.md, "Who Has?"), off until the Viewer
 * opts in: then its Injury Events pop up as guesses when the app opens.
 */

import { SwitchWell } from './Picker'
import { useSetFantasyLeagueWhoHas } from '@/lib/fantasy/useFantasy'

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
      className="flex w-full items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5 text-left disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-3xs font-bold text-foreground/80 uppercase">
          Who Has?
        </span>
        <span className="block text-xs text-muted">
          {shown
            ? 'On. When a notable player in this league gets hurt, guess which team has them next time you open the app.'
            : 'Off. Turn on to guess which team has a notable player in this league when they get hurt.'}
        </span>
        {set.error && (
          <span role="alert" className="block text-xs text-negative">
            {set.error.message}
          </span>
        )}
      </span>
      <SwitchWell on={shown} />
    </button>
  )
}
