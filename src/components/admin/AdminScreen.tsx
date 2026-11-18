/**
 * The health page (docs/adr/0005), for admins: every background job's
 * heartbeat, every connected account's sync, and errors grouped by kind.
 */

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ErrorView, JobView, OpsHealth } from '@/lib/ops/server'
import { AppHeader } from '@/components/layout/AppHeader'
import { ScreenError } from '@/components/layout/RouteStates'
import { Skeleton, SkeletonStatus } from '@/components/layout/Skeleton'
import { timeAgo, useNow } from '@/components/timeline/format'
import { opsHealthQuery } from '@/lib/ops/queries'
import { cn } from '@/lib/utils'
import { dateTime } from '@/lib/time/format'
import { useTimeZone } from '@/lib/time/useTimeZone'

const DAY = 24 * 3_600_000

export function AdminScreen() {
  const health = useQuery(opsHealthQuery())
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <AppHeader />
      <h1 className="mb-4 text-xl font-bold tracking-tight">Health</h1>
      {health.isPending ? (
        <HealthSkeleton />
      ) : health.data === undefined ? (
        <ScreenError error={health.error} onRetry={() => health.refetch()} />
      ) : health.data.denied ? (
        <p className="rounded-card border border-border bg-surface px-4 py-3 text-sm text-muted">
          Signed in as{' '}
          <span className="font-semibold text-foreground">
            {health.data.email}
          </span>
          , which isn’t an admin.
        </p>
      ) : (
        <Health health={health.data} />
      )}
    </div>
  )
}

/** The page's shape while it loads: the three counts, then the jobs. */
function HealthSkeleton() {
  return (
    <SkeletonStatus className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-card" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    </SkeletonStatus>
  )
}

/** Working, failing since it last worked, or not working for too long. */
function jobState(j: JobView): 'ok' | 'failing' | 'stale' {
  if (j.stale) return 'stale'
  if (j.lastErrorAt && (!j.lastOkAt || j.lastErrorAt > j.lastOkAt))
    return 'failing'
  return 'ok'
}

/** Health colors, fixed: the app's gold "scoring" reads as a warning here. */
const DOT = {
  ok: 'bg-positive',
  failing: 'bg-warning',
  stale: 'bg-negative',
} as const

function Health({ health }: { health: OpsHealth }) {
  const now = useNow(15_000)
  const states = health.jobs.map(jobState)
  const recentErrors = health.errors
    .filter((e) => now !== null && now - Date.parse(e.lastAt) < DAY)
    .reduce((n, e) => n + e.count, 0)
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-card border border-border bg-border text-center">
        <Summary
          label="Stale jobs"
          value={states.filter((s) => s === 'stale').length}
          bad
        />
        <Summary
          label="Failing jobs"
          value={states.filter((s) => s === 'failing').length}
          bad
        />
        <Summary label="Errors (24h)" value={recentErrors} bad />
      </div>

      <Section title={`Jobs · ${health.jobs.length}`}>
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {health.jobs.map((j) => {
            const state = jobState(j)
            const [task, viewer] = j.name.split(':')
            return (
              <li key={j.name} className="flex items-start gap-3 px-3 py-2">
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    DOT[state],
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {task}
                    {viewer && (
                      <span className="ml-1 text-xs text-muted">
                        {viewer.slice(0, 6)}
                      </span>
                    )}
                  </span>
                  {state !== 'ok' && j.lastError && (
                    <span className="block truncate text-xs text-live">
                      {j.lastError}
                    </span>
                  )}
                </span>
                <span className="text-right text-xs text-muted tabular-nums">
                  <span className="block">
                    {j.lastOkAt ? `ok ${timeAgo(j.lastOkAt, now)}` : 'never ok'}
                  </span>
                  <span className="block">
                    {j.lastDurationMs !== null &&
                      `${(j.lastDurationMs / 1000).toFixed(1)}s · `}
                    {j.failures}/{j.runs} failed
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title="Accounts">
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {health.accounts.map((a) => (
            <li
              key={`${a.provider}${a.viewer}`}
              className="flex items-start gap-3 px-3 py-2 text-sm"
            >
              <span
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  a.status === 'ok' ? DOT.ok : DOT.stale,
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium capitalize">
                  {a.provider}
                  <span className="ml-1 text-xs font-normal text-muted normal-case">
                    {a.viewer}
                  </span>
                </span>
                {a.lastError && (
                  <span className="block truncate text-xs text-live">
                    {a.lastError}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted">
                {a.syncedAt ? timeAgo(a.syncedAt, now) : 'never'}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Errors · ${health.errors.length} kinds`}>
        {health.errors.length === 0 ? (
          <p className="text-sm text-muted">None recorded.</p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {health.errors.map((e) => (
              <ErrorRow key={e.fingerprint} error={e} now={now} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function ErrorRow({ error: e, now }: { error: ErrorView; now: number | null }) {
  const [open, setOpen] = useState(false)
  const timeZone = useTimeZone()
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-3 py-2 text-left"
      >
        <span className="mt-0.5 shrink-0 rounded-control bg-notice px-1.5 py-0.5 text-3xs font-bold text-muted uppercase">
          {e.scope}
        </span>
        <span className="min-w-0 flex-1 text-sm leading-snug">{e.message}</span>
        <span className="shrink-0 text-right text-xs text-muted tabular-nums">
          <span className="block font-semibold text-foreground">
            ×{e.count}
          </span>
          <span className="block">{timeAgo(e.lastAt, now)}</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs text-muted">
          <p className="mb-1">
            First seen {dateTime(e.firstAt, timeZone)} · last{' '}
            {dateTime(e.lastAt, timeZone)}
          </p>
          {e.details && (
            <pre className="max-h-64 overflow-auto rounded-control bg-notice p-2 text-2xs leading-snug whitespace-pre-wrap">
              {e.details}
            </pre>
          )}
        </div>
      )}
    </li>
  )
}

function Summary({
  label,
  value,
  bad,
}: {
  label: string
  value: number
  bad?: boolean
}) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <span
        className={cn(
          'block text-2xl font-bold tabular-nums',
          bad && value > 0 ? 'text-negative' : 'text-positive',
        )}
      >
        {value}
      </span>
      <span className="text-2xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </span>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}
