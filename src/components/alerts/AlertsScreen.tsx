/**
 * Alerts (CONTEXT.md, "Alert"): turn them on for this device, then choose
 * each source's Alert level: Following, Predictions, Fantasy.
 */

import type { AlertLevels } from '@/lib/push/alerts'
import { AppHeader } from '@/components/layout/AppHeader'
import { useEspnConnection } from '@/lib/fantasy/useFantasy'
import { useKalshiConnection } from '@/lib/kalshi/usePredictions'
import { useAlertLevels, useAlerts } from '@/lib/push/useAlerts'
import { useViewer } from '@/lib/viewer/useViewer'
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
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left disabled:opacity-60"
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
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          on ? 'bg-accent' : 'bg-notice',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform',
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
    <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
      <p className="mb-1 font-semibold">{title}</p>
      <p className="text-muted">{children}</p>
    </div>
  )
}

type Choice<TSource extends keyof AlertLevels> = {
  value: AlertLevels[TSource]
  label: string
  hint: string
}

const CHOICES: { [K in keyof AlertLevels]: ReadonlyArray<Choice<K>> } = {
  following: [
    {
      value: 'scores',
      label: 'Scores & finals',
      hint: 'Every score, overturned score and final in your Teams’ and Players’ games.',
    },
    {
      value: 'finals',
      label: 'Finals only',
      hint: 'Just how each game ended.',
    },
    { value: 'off', label: 'Off', hint: '' },
  ],
  predictions: [
    {
      value: 'key',
      label: 'Key moments',
      hint: 'Your odds swinging 20+ points, a combo leg hitting or missing, and the result.',
    },
    {
      value: 'scores',
      label: 'Key moments + every score',
      hint: 'Also every scoring play in your Predictions’ games.',
    },
    { value: 'off', label: 'Off', hint: '' },
  ],
  fantasy: [
    {
      value: 'key',
      label: 'Key events, both teams',
      hint: 'Touchdowns and other scores by any starter in your matchups, and your starters’ big plays.',
    },
    {
      value: 'mine',
      label: 'Key events, my starters',
      hint: 'Only your own starters’ scores and big plays.',
    },
    { value: 'off', label: 'Off', hint: '' },
  ],
}

function Levels() {
  const { state } = useAlerts()
  const { levels, set } = useAlertLevels(true)
  const kalshi = useKalshiConnection()
  const espn = useEspnConnection()
  if (!levels) return null
  const sections: ReadonlyArray<readonly [keyof AlertLevels, string]> = [
    ['following', 'Following'],
    ...(kalshi.data ? [['predictions', 'Predictions'] as const] : []),
    ...(espn.data ? [['fantasy', 'Fantasy'] as const] : []),
  ]
  return (
    <div className={cn('flex flex-col gap-5', state !== 'on' && 'opacity-60')}>
      {sections.map(([source, title]) => (
        <section key={source}>
          <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
            {title}
          </h2>
          <div
            role="radiogroup"
            aria-label={`${title} Alerts`}
            className="divide-y divide-border rounded-xl border border-border bg-surface"
          >
            {(CHOICES[source] as ReadonlyArray<Choice<typeof source>>).map(
              (c) => {
                const checked = levels[source] === c.value
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() =>
                      set({ ...levels, [source]: c.value } as AlertLevels)
                    }
                    className="flex w-full items-start gap-3 px-4 py-3 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                        checked ? 'border-accent' : 'border-border',
                      )}
                    >
                      {checked && (
                        <span className="size-2.5 rounded-full bg-accent" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {c.label}
                      </span>
                      {c.hint && (
                        <span className="block text-xs text-muted">
                          {c.hint}
                        </span>
                      )}
                    </span>
                  </button>
                )
              },
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
