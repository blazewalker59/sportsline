import type { AlertLevels } from '@/lib/push/alerts'
import { useEspnConnection } from '@/lib/fantasy/useFantasy'
import { useKalshiConnection } from '@/lib/kalshi/usePredictions'
import { useAlertLevels, useAlerts } from '@/lib/push/useAlerts'
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
    <>
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
          <span className="block text-[11px] text-muted">On this device</span>
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
      {on && <AlertLevelRows />}
    </>
  )
}

const OPTIONS: {
  [K in keyof AlertLevels]: ReadonlyArray<[AlertLevels[K], string]>
} = {
  following: [
    ['scores', 'Scores & finals'],
    ['finals', 'Finals only'],
    ['off', 'Off'],
  ],
  predictions: [
    ['key', 'Key moments'],
    ['scores', 'Key moments + every score'],
    ['off', 'Off'],
  ],
  fantasy: [
    ['key', 'Key events, both teams'],
    ['mine', 'Key events, my starters'],
    ['off', 'Off'],
  ],
}

const HINTS: Record<keyof AlertLevels, string> = {
  following: 'Teams and Players you follow',
  predictions: 'Odds swings, legs hit or missed, results',
  fantasy: 'Touchdowns, scores and big plays',
}

/** How much each source sends: one row each, as a native picker. */
function AlertLevelRows() {
  const { levels, set } = useAlertLevels(true)
  const kalshi = useKalshiConnection()
  const espn = useEspnConnection()
  if (!levels) return null
  const rows: ReadonlyArray<readonly [keyof AlertLevels, string]> = [
    ['following', 'Following'],
    ...(kalshi.data ? [['predictions', 'Predictions'] as const] : []),
    ...(espn.data ? [['fantasy', 'Fantasy'] as const] : []),
  ]
  return (
    <div className="flex flex-col gap-1 px-3 pb-2">
      {rows.map(([source, label]) => (
        <label key={source} className="flex items-center gap-3 py-1 text-sm">
          <span className="flex-1">
            <span className="block">{label}</span>
            <span className="block text-[11px] text-muted">
              {HINTS[source]}
            </span>
          </span>
          <select
            value={levels[source]}
            onChange={(e) =>
              set({ ...levels, [source]: e.target.value } as AlertLevels)
            }
            className="max-w-[9.5rem] rounded-lg border border-border bg-background px-2 py-1 text-[13px]"
          >
            {OPTIONS[source].map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}
