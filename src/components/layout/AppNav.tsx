/**
 * The app's main navigation, for signed-in Viewers: Timeline, Predictions,
 * Fantasy and Follows. One element in two shapes: a tab bar along the
 * bottom on narrow screens (over the bottom safe-area inset), a rail down
 * the left from `md` (icons over labels), widening at `lg` (icons beside
 * labels). Sheets, the reaction bar and Who Has? all sit above it.
 *
 * AppShell lays the screens out around it: room at the bottom for the bar,
 * or at the left for the rail. Anything a screen pins with `fixed` across
 * the width (the Timeline's top) starts after the rail with NAV_INSET_LEFT.
 */

import { Link } from '@tanstack/react-router'
import { NavGlyph } from './NavIcon'
import type { IconName } from './NavIcon'
import { useViewer } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

/** Where a screen's `fixed` full-width layer starts, clear of the rail. */
export const NAV_INSET_LEFT = 'md:left-20 lg:left-56'

/** Room for the bar under every screen's content, or for the rail beside it. */
const SHELL_PADDING = 'pb-14 md:pb-0 md:pl-20 lg:pl-56'

interface Destination {
  to: '/' | '/predictions' | '/fantasy' | '/follows'
  label: string
  icon: IconName
  /** The Timeline is active only on itself; the rest include their pages. */
  exact: boolean
  /** The icon's section color while active (a literal, for Tailwind). */
  tone: string
}

export const DESTINATIONS: ReadonlyArray<Destination> = [
  {
    to: '/',
    label: 'Timeline',
    icon: 'timeline',
    exact: true,
    tone: 'group-data-[status=active]:text-accent',
  },
  {
    to: '/predictions',
    label: 'Predictions',
    icon: 'predictions',
    exact: false,
    tone: 'group-data-[status=active]:text-section-predictions',
  },
  {
    to: '/fantasy',
    label: 'Fantasy',
    icon: 'fantasy',
    exact: false,
    tone: 'group-data-[status=active]:text-section-fantasy',
  },
  {
    to: '/follows',
    label: 'Follows',
    icon: 'follows',
    exact: false,
    tone: 'group-data-[status=active]:text-accent',
  },
]

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
  // Sportsline is only for Viewers: no navigation on the Landing.
  if (!data?.viewer) return null
  return (
    <nav
      aria-label="Main"
      // Not a Scope swipe, and its own View Transition layer: it holds
      // still (and on top) while the Timeline's messages move.
      data-no-swipe
      style={{ viewTransitionName: 'app-nav' }}
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]',
        'md:top-0 md:right-auto md:w-20 md:border-t-0 md:border-r md:pt-[max(env(safe-area-inset-top),0.75rem)] md:pb-0',
        'lg:w-56',
      )}
    >
      {/* The rail's brand mark (the header's wordmark is the link home). */}
      <div className="mx-auto mb-4 hidden size-11 items-center justify-center md:flex lg:mx-3 lg:justify-start">
        <img src="/favicon.svg" alt="" width={28} height={28} />
      </div>
      <ul className="flex h-14 md:h-auto md:flex-col md:gap-1 md:px-2 lg:px-3">
        {DESTINATIONS.map((d) => (
          <li key={d.to} className="flex flex-1 md:flex-none">
            <Link
              to={d.to}
              activeOptions={{ exact: d.exact, includeSearch: false }}
              className={cn(
                'group flex flex-1 flex-col items-center justify-center gap-0.5 rounded-card text-3xs font-medium text-muted',
                'md:py-2 md:hover:bg-surface',
                'lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm',
                'data-[status=active]:font-semibold data-[status=active]:text-foreground md:data-[status=active]:bg-surface',
              )}
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full',
                  d.tone,
                )}
              >
                <NavGlyph name={d.icon} className="size-5" />
              </span>
              {d.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
