/**
 * Alerts (CONTEXT.md, "Alert"): turn them on for this device, then choose
 * each source's Alert level: Following, Predictions, Fantasy.
 */

import { useQuery } from '@tanstack/react-query'
import type { AlertLevels } from '@/lib/push/alerts'
import { AppHeader } from '@/components/layout/AppHeader'
import { InlineError } from '@/components/layout/RouteStates'
import { RowsSkeleton } from '@/components/layout/Skeleton'
import { useFantasyConnected } from '@/lib/fantasy/useFantasy'
import { useKalshiConnection } from '@/lib/kalshi/usePredictions'
import {
  alertLevelsQuery,
  useAlertLevels,
  useAlerts,
} from '@/lib/push/useAlerts'
import { useViewer } from '@/lib/viewer/useViewer'
import { Segmented } from '@/components/signal/Segmented'
import { SectionLabel } from '@/components/signal/Section'
import { cn } from '@/lib/utils'

export function AlertsScreen() {
  const { data: viewerState, isPending } = useViewer()
  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      <h1 className="mb-4 text-xl font-bold tracking-tight">Alerts</h1>
      {isPending ? null : !viewerState?.viewer ? (
        <p className="mt-16 text-center text-sm text-muted">
          Sign in to get Alerts.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <DeviceSection />
          <Levels />
          <p className="text-xs leading-relaxed text-muted">
            Each Alert names where it’s from (Following, Prediction or Fantasy)
            and opens that view. A newer Alert about the same game replaces the
            older one on your lock screen.
          </p>
        </div>
      )}
    </div>
  )
}

function DeviceSection() {
  const { state, busy, enable, disable } = useAlerts()
  if (state === 'loading') return null
  if (state === 'unsupported')
    return (
      <Notice title="This browser can’t receive Alerts">
        Try Safari on iPhone (from the Home Screen), or Chrome, Edge or Firefox.
      </Notice>
    )
  if (state === 'needs-install')
    return (
      <Notice title="Add Sportsline to your Home Screen">
        In Safari, tap <strong>Share</strong> →{' '}
        <strong>Add to Home Screen</strong>, then open Sportsline from your Home
        Screen to turn Alerts on.
      </Notice>
    )
  if (state === 'denied')
    return (
      <Notice title="Alerts are blocked">
        Turn on notifications for Sportsline in your device’s Settings.
      </Notice>
    )
  const on = state === 'on'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => void (on ? disable() : enable())}
      className="flex w-full items-center gap-3 rounded-card bg-surface p-4 text-left disabled:opacity-60"
    >
      <span className="flex-1">
        <span className="block font-semibold">Alerts on this device</span>
        <span className="block text-xs text-muted">
          {on
            ? 'On. Choose what each feed sends below.'
            : 'Off. Turn on to get Alerts here.'}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'well relative h-7 w-12 shrink-0 rounded-full transition-colors',
          on && 'bg-foreground',
        )}
      >
        <span
          className={cn(
            'key absolute top-0.5 size-6 rounded-full transition-transform',
            on ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}

function Notice({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="well rounded-card px-4 py-4 text-sm">
      <p className="mb-1 font-semibold">{title}</p>
      <p className="text-muted">{children}</p>
    </div>
  )
}

type Choice<TSource extends keyof AlertLevels> = {
  value: AlertLevels[TSource]
  label: string
  /** On the switch's key. */
  short: string
  hint: string
}

const CHOICES: { [K in keyof AlertLevels]: ReadonlyArray<Choice<K>> } = {
  following: [
    {
      value: 'scores',
      label: 'Scores & finals',
      short: 'Scores',
      hint: 'Every score, overturned score and final in your Teams’ and Players’ games; NBA lead changes only in close fourth quarters and overtime.',
    },
    {
      value: 'finals',
      label: 'Finals only',
      short: 'Finals',
      hint: 'Just how each game ended.',
    },
    { value: 'off', label: 'Off', short: 'Off', hint: '' },
  ],
  predictions: [
    {
      value: 'key',
      label: 'Key moments',
      short: 'Key',
      hint: 'Your odds swinging 20+ points, a combo leg hitting or missing, and the result.',
    },
    {
      value: 'scores',
      label: 'Key moments + every score',
      short: '+Scores',
      hint: 'Also every scoring play in your Predictions’ games; NBA lead changes only in close fourth quarters and overtime.',
    },
    { value: 'off', label: 'Off', short: 'Off', hint: '' },
  ],
  fantasy: [
    {
      value: 'key',
      label: 'Key events, both teams',
      short: 'Both',
      hint: 'Scores by any starter; NBA point thresholds, double-doubles and standout stat lines; plus your starters’ big plays.',
    },
    {
      value: 'mine',
      label: 'Key events, my starters',
      short: 'Mine',
      hint: 'Only your own starters’ scores, milestones and big plays.',
    },
    { value: 'off', label: 'Off', short: 'Off', hint: '' },
  ],
}

function Levels() {
  const { state } = useAlerts()
  const { levels, set } = useAlertLevels(true)
  // The same cached read, for whether it's still loading or failed.
  const read = useQuery(alertLevelsQuery())
  const kalshi = useKalshiConnection()
  const fantasy = useFantasyConnected()
  if (!levels) {
    if (read.isError)
      return (
        <InlineError
          what="your Alert choices"
          error={read.error}
          onRetry={() => read.refetch()}
        />
      )
    // Where the first section's choices will be, under its heading's room.
    return (
      <RowsSkeleton
        rows={3}
        label="Loading your Alert choices"
        className="mt-6"
      />
    )
  }
  const sections: ReadonlyArray<readonly [keyof AlertLevels, string]> = [
    ['following', 'Following'],
    ...(kalshi.data ? [['predictions', 'Predictions'] as const] : []),
    ...(fantasy.connected ? [['fantasy', 'Fantasy'] as const] : []),
  ]
  return (
    <section className={cn(state !== 'on' && 'opacity-60')}>
      <SectionLabel title="Alert levels" index="I1" />
      <div className="flex flex-col divide-y divide-border rounded-card bg-surface px-4">
        {sections.map(([source, title]) => {
          const choices = CHOICES[source] as ReadonlyArray<
            Choice<typeof source>
          >
          const current = choices.find((c) => c.value === levels[source])
          return (
            <div key={source} className="flex flex-col gap-2 py-4">
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3">
                <h2 className="text-sm font-semibold">{title}</h2>
                <Segmented
                  fill
                  label={`${title} Alerts`}
                  value={levels[source]}
                  options={choices.map((c) => [c.value, c.short, c.label])}
                  onChange={(value) =>
                    set({ ...levels, [source]: value } as AlertLevels)
                  }
                />
              </div>
              {current && current.value !== 'off' && (
                <p className="text-xs text-muted">
                  <span className="font-semibold text-foreground">
                    {current.label}.
                  </span>{' '}
                  {current.hint}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
