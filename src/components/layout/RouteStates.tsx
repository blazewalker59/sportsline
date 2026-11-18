/**
 * What a screen shows instead of itself when its route fails, can't find
 * what it was asked for, or is still loading: each keeps the app's header,
 * so one bad query never blanks the whole app. Routes hand these to the
 * router as errorComponent, notFoundComponent and pendingComponent.
 *
 * Screens that load inside themselves use the in-screen halves: a
 * ScreenError (their main query failed) or a NotFoundState under their
 * own header, and an InlineError where one part among several failed.
 */

import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AppHeader } from './AppHeader'
import { DetailHeaderSkeleton, RowsSkeleton } from './Skeleton'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { isStaleBuild, reloadForNewBuild } from '@/lib/ops/staleBuild'
import { sendClientError } from '@/lib/ops/useClientErrors'
import { GENERIC_MESSAGE, UserError, isSignInRequired } from '@/lib/userError'
import { cn } from '@/lib/utils'

/** The column every screen sits in, with the header on top. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      {children}
    </div>
  )
}

function Panel({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <div className="mt-16 flex flex-col items-center gap-3 text-center">
      <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      <p className="max-w-sm text-sm text-muted">{body}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {children}
      </div>
    </div>
  )
}

/** Back to the Timeline, unless that's where the Viewer already is. */
function TimelineLink({ primary }: { primary?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  if (pathname === '/') return null
  return (
    <Link
      to="/"
      className={
        primary
          ? 'flex min-h-11 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background'
          : 'flex min-h-11 items-center rounded-full bg-accent-soft px-5 text-sm font-semibold text-accent'
      }
    >
      Back to the Timeline
    </Link>
  )
}

/** A UserError's own words, written for the Viewer; else null. */
function userMessage(error: unknown): string | null {
  if (error instanceof UserError && error.message !== GENERIC_MESSAGE)
    return error.message
  return null
}

/** A message the Viewer can read: a UserError's own words, else ours. */
function messageFor(error: unknown): string {
  return (
    userMessage(error) ??
    'This screen didn’t load. It’s been reported; trying again usually works.'
  )
}

/**
 * A route's loader or screen threw. Reported like the root's crash screen
 * (and a tab left open across a deploy reloads into the new build), but
 * the header stays, and Try again re-runs just this route's load.
 */
export function RouteErrorPanel({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  useEffect(() => {
    if (isStaleBuild(error) && reloadForNewBuild()) return
    sendClientError(error, 'route')
  }, [error])

  const retry = async () => {
    setRetrying(true)
    try {
      // Marks the route's match invalid and runs its loader again; the new
      // match resets this boundary, so the screen renders afresh and its
      // queries refetch on mount.
      await router.invalidate()
    } finally {
      setRetrying(false)
      reset()
    }
  }

  return (
    <Frame>
      <div role="alert">
        <Panel title="Couldn’t load this" body={messageFor(error)}>
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying}
            className="min-h-11 rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-60"
          >
            {retrying ? 'Trying…' : 'Try again'}
          </button>
          <TimelineLink />
        </Panel>
      </div>
    </Frame>
  )
}

/**
 * The route was asked for something that doesn't exist (a bad Game, Play,
 * Player or Team id), as opposed to failing to load it.
 */
export function NotFoundPanel({
  what = 'page',
}: {
  /** The thing that wasn't found, in lower case: "game", "player". */
  what?: string
}) {
  return (
    <Frame>
      <NotFoundState what={what} />
    </Frame>
  )
}

/**
 * NotFoundPanel's message without the frame, for a screen that finds out
 * itself (its query answered null) under its own header: a bad id reads
 * the same whether the route or the screen caught it.
 */
export function NotFoundState({ what = 'page' }: { what?: string }) {
  return (
    <Panel
      title={`No such ${what}`}
      body={`This ${what} doesn’t exist, or the link to it is out of date.`}
    >
      <TimelineLink primary />
    </Panel>
  )
}

/** While a route's loader holds the screen: its header and its shape. */
export function RoutePending({
  shape = 'rows',
}: {
  /** "detail": a Player or Team page's header over rows; "rows": a list. */
  shape?: 'rows' | 'detail'
}) {
  return (
    <Frame>
      {shape === 'detail' && <DetailHeaderSkeleton className="mt-2 mb-6" />}
      <RowsSkeleton className="mt-2" />
    </Frame>
  )
}

/**
 * Should the browser report this failed query? Not when the server already
 * did: safeErrors reports an unexpected failure and sends the generic
 * message in its place. Not a UserError either, which is an answer written
 * for the Viewer (Kalshi refused, a bad league URL), not a fault; nor
 * signing out, which the Gate answers with the Landing.
 */
export function shouldReport(error: unknown): boolean {
  if (error instanceof UserError || isSignInRequired(error)) return false
  if (error instanceof Error && error.message === GENERIC_MESSAGE) return false
  return true
}

/** Report a failed query once per failure, as the rest of the app does. */
export function useReportError(error: unknown): void {
  useEffect(() => {
    if (error && shouldReport(error)) sendClientError(error, 'query')
  }, [error])
}

/** Runs a retry (a query's refetch), and says so while it's under way. */
function useRetry(onRetry: () => Promise<unknown>) {
  const [retrying, setRetrying] = useState(false)
  const retry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }
  return { retrying, retry: () => void retry() }
}

/**
 * A screen's main query failed: what RouteErrorPanel says, in place under
 * the screen's own header, with Try again refetching that query.
 */
export function ScreenError({
  error,
  onRetry,
}: {
  error: unknown
  /** Refetch what failed, e.g. `() => query.refetch()`. */
  onRetry: () => Promise<unknown>
}) {
  useReportError(error)
  const { retrying, retry } = useRetry(onRetry)
  return (
    <div role="alert">
      <Panel title="Couldn’t load this" body={messageFor(error)}>
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          className="min-h-11 rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-60"
        >
          {retrying ? 'Trying…' : 'Try again'}
        </button>
        <TimelineLink />
      </Panel>
    </div>
  )
}

/**
 * One part of a screen failed (a section, a tab, a sheet) while the rest
 * stands: a card in its place that says so, with Try again.
 */
export function InlineError({
  error,
  onRetry,
  what,
  className,
}: {
  error: unknown
  /** Refetch what failed, e.g. `() => query.refetch()`. */
  onRetry: () => Promise<unknown>
  /** What didn't load, finishing "Couldn’t load …": "your record". */
  what: string
  className?: string
}) {
  useReportError(error)
  const { retrying, retry } = useRetry(onRetry)
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5 text-sm',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-negative">
          {`Couldn’t load ${what}.`}
        </span>
        <span className="block text-xs text-muted">
          {userMessage(error) ?? 'Trying again usually works.'}
        </span>
      </span>
      <button
        type="button"
        onClick={retry}
        disabled={retrying}
        className="min-h-9 shrink-0 rounded-full bg-notice px-3 text-sm font-semibold disabled:opacity-60"
      >
        {retrying ? 'Trying…' : 'Try again'}
      </button>
    </div>
  )
}
