import { useAlerts } from '@/lib/push/useAlerts'
import { cn } from '@/lib/utils'

/** The account menu's Alerts switch (CONTEXT.md, "Alert"). */
export function AlertsItem() {
  const { state, busy, enable, disable } = useAlerts()
  if (state === 'loading' || state === 'unsupported') return null

  if (state === 'needs-install') {
    return (
      <div className="rounded-lg px-3 py-2 text-xs leading-snug text-muted">
        <p className="mb-1 text-sm font-semibold text-foreground">Get Alerts</p>
        In Safari, tap{' '}
        <span className="font-semibold text-foreground">Share</span> →{' '}
        <span className="font-semibold text-foreground">
          Add to Home Screen
        </span>
        , then open Sportsline from your Home Screen.
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <p className="rounded-lg px-3 py-2 text-xs leading-snug text-muted">
        <span className="block text-sm font-semibold text-foreground">
          Alerts are blocked
        </span>
        Turn on notifications for Sportsline in Settings.
      </p>
    )
  }

  const on = state === 'on'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => void (on ? disable() : enable())}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-background disabled:opacity-60"
    >
      <span className="flex-1">
        <span className="block">Alerts</span>
        <span className="block text-[11px] text-muted">
          Scores and finals for your Teams and Players
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-10 shrink-0 rounded-full transition-colors',
          on ? 'bg-accent' : 'bg-notice',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform',
            on ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}
