/**
 * The app's main navigation, for signed-in Viewers: Timeline, Predictions,
 * Fantasy and Follows. One element in two shapes, both a floating sheet of
 * glass (`.glass-nav` in styles.css): a capsule tab bar above the bottom
 * safe-area inset on narrow screens, with the screen scrolling visibly
 * beneath it, and from `md` a full-height glass panel floating inside the
 * left column (icons over labels), widening at `lg` (icons beside labels).
 * A glass lozenge sits behind the active tab and slides between tabs.
 * Sheets, the reaction bar and Who Has? all sit above it.
 *
 * AppShell lays the screens out around it: room at the bottom for the bar,
 * or at the left for the rail. Anything a screen pins with `fixed` across
 * the width (the Timeline's top) starts after the rail with NAV_INSET_LEFT.
 */

import { Link, useRouterState } from '@tanstack/react-router'
import { NavGlyph } from './NavIcon'
import type { IconName } from './NavIcon'
import { useViewer } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

/** Where a screen's `fixed` full-width layer starts, clear of the rail. */
export const NAV_INSET_LEFT = 'md:left-20 lg:left-56'

/**
 * Room for the bar under every screen's content, or for the rail beside it.
 * The bar floats max(safe-area, 12px) up and is 64px tall; the body already
 * pads the safe-area inset, so 96px leaves the last row a clear 20px or more.
 */
const SHELL_PADDING = 'pb-24 md:pb-0 md:pl-20 lg:pl-56'

interface Destination {
  to: '/' | '/predictions' | '/fantasy' | '/follows'
  label: string
  icon: IconName
  /** The Timeline is active only on itself; the rest include their pages. */
  exact: boolean
  /** The icon's section color while active (a token, as a CSS value). */
  tone: string
}

export const DESTINATIONS: ReadonlyArray<Destination> = [
  {
    to: '/',
    label: 'Timeline',
    icon: 'timeline',
    exact: true,
    tone: 'var(--accent)',
  },
  {
    to: '/predictions',
    label: 'Predictions',
    icon: 'predictions',
    exact: false,
    tone: 'var(--section-predictions)',
  },
  {
    to: '/fantasy',
    label: 'Fantasy',
    icon: 'fantasy',
    exact: false,
    tone: 'var(--section-fantasy)',
  },
  {
    to: '/follows',
    label: 'Follows',
    icon: 'follows',
    exact: false,
    tone: 'var(--accent)',
  },
]

/**
 * Which destination is the current page (its index), or -1 for none: the
 * same rule the tabs' `aria-current` follows, so the lozenge sits behind
 * the tab marked current.
 */
export function activeDestination(pathname: string): number {
  return DESTINATIONS.findIndex((d) =>
    d.exact
      ? pathname === d.to
      : pathname === d.to || pathname.startsWith(`${d.to}/`),
  )
}

/** Screens with the navigation, for a signed-in Viewer; bare otherwise. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { data } = useViewer()
  if (!data?.viewer) return <>{children}</>
  return (
    <>
      <div className={SHELL_PADDING}>{children}</div>
      <AppNav />
    </>
  )
}

export function AppNav() {
  const { data } = useViewer()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Sportsline is only for Viewers: no navigation on the Landing.
  if (!data?.viewer) return null
  const active = activeDestination(pathname)
  return (
    <nav
      aria-label="Main"
      // Not a Scope swipe, and its own View Transition layer: it holds
      // still (and on top) while the Timeline's messages move.
      data-no-swipe
      style={{ viewTransitionName: 'app-nav' }}
      className={cn(
        'glass-nav fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-20 mx-auto max-w-md rounded-full',
        'md:inset-x-auto md:top-[max(env(safe-area-inset-top),0.5rem)] md:bottom-2 md:left-1.5 md:mx-0 md:flex md:w-18.5 md:max-w-none md:flex-col md:rounded-glass md:pt-3',
        'lg:top-[max(env(safe-area-inset-top),0.75rem)] lg:bottom-3 lg:left-3 lg:w-50 lg:pt-4',
      )}
    >
      {/* The rail's brand mark (the header's wordmark is the link home). */}
      <div className="mx-auto mb-3 hidden size-11 items-center justify-center md:flex lg:mx-4 lg:justify-start">
        <img src="/favicon.svg" alt="" width={28} height={28} />
      </div>
      <div className="relative h-16 p-1 md:h-auto md:px-1 md:py-0 lg:px-2">
        {/* The active tab's lozenge: one piece of glass that slides. */}
        <span
          aria-hidden="true"
          data-nav-lozenge
          data-active={active}
          className="glass-nav-lozenge"
          style={{ '--i': Math.max(active, 0) } as React.CSSProperties}
        />
        <ul className="relative flex h-full md:flex-col md:gap-1">
          {DESTINATIONS.map((d) => (
            <li key={d.to} className="flex flex-1 md:flex-none">
              <Link
                to={d.to}
                activeOptions={{ exact: d.exact, includeSearch: false }}
                style={{ '--nav-tone': d.tone } as React.CSSProperties}
                className={cn(
                  'glass-nav-tab group flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-3xs font-medium text-glass-ink-muted',
                  'md:h-14 md:rounded-card',
                  'lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm',
                  'data-[status=active]:font-semibold data-[status=active]:text-glass-ink',
                )}
              >
                <span className="glass-nav-icon flex size-7 items-center justify-center">
                  <NavGlyph name={d.icon} className="size-5.5" />
                </span>
                {d.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
