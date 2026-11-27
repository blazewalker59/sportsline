/**
 * The app's main navigation, for signed-in Viewers: the Timeline's four
 * Scopes (CONTEXT.md, "Scope"), Following, All, Predictions and Fantasy.
 * Each tab shows the Timeline in its Scope, from any screen; on the
 * Timeline the tab of the Scope showing is current (All for any League,
 * Top 25 or Conference), and away from it none is. The screens for
 * managing Follows, Predictions and Fantasy are in the account menu.
 *
 * One element in two shapes, both a floating sheet of glass (`.glass-nav`
 * in styles.css): a capsule tab bar above the bottom safe-area inset on
 * narrow screens, with the screen scrolling visibly beneath it, and from
 * `md` a full-height glass panel floating inside the left column (icons
 * over labels), widening at `lg` (icons beside labels). A glass lozenge
 * sits behind the current tab and slides between tabs, following a swipe
 * across the Timeline too. Sheets, the reaction bar and Who Has? all sit
 * above it.
 *
 * AppShell lays the screens out around it: room at the bottom for the bar,
 * or at the left for the rail. Anything a screen pins with `fixed` across
 * the width (the Timeline's top) starts after the rail with NAV_INSET_LEFT.
 */

import { useRouter } from '@tanstack/react-router'
import { NavGlyph } from './NavIcon'
import type { IconName } from './NavIcon'
import type { Scope, ScopeTab } from '@/lib/model/scope'
import { Mark } from '@/components/signal/Logo'
import {
  useCurrentScope,
  useGoToScope,
  useLastLeague,
  useRowItems,
} from '@/components/timeline/scopeNav'
import { SCOPE_TABS, scopeTab } from '@/lib/model/scope'
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

interface Tab {
  scope: ScopeTab
  label: string
  /** What a screen reader hears: the label alone is terse out of context. */
  name: string
  icon: IconName
  /** The icon's section color while current (a token, as a CSS value). */
  tone: string
}

const TAB: Record<ScopeTab, Omit<Tab, 'scope'>> = {
  following: {
    label: 'Following',
    name: 'Following',
    icon: 'follows',
    tone: 'var(--accent)',
  },
  all: {
    label: 'All',
    name: 'All Leagues',
    icon: 'all',
    tone: 'var(--accent)',
  },
  predictions: {
    label: 'Predictions',
    name: 'Predictions',
    icon: 'predictions',
    tone: 'var(--section-predictions)',
  },
  fantasy: {
    label: 'Fantasy',
    name: 'Fantasy',
    icon: 'fantasy',
    tone: 'var(--section-fantasy)',
  },
}

/** The tabs, in the order the bar, the rail and a swipe all follow. */
export const TABS: ReadonlyArray<Tab> = SCOPE_TABS.map((scope) => ({
  scope,
  ...TAB[scope],
}))

/**
 * Which tab is current (its index), or -1 for none: the Scope's tab on the
 * Timeline, nothing elsewhere. The lozenge sits behind the same tab that
 * `aria-current` marks.
 */
export function activeTab(scope: Scope | null): number {
  return scope === null ? -1 : SCOPE_TABS.indexOf(scopeTab(scope))
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
  // Sportsline is only for Viewers: no navigation on the Landing.
  if (!data?.viewer) return null
  return <ScopeNav />
}

function ScopeNav() {
  const scope = useCurrentScope()
  const items = useRowItems()
  // All goes back to the League choice last made under it.
  const lastLeague = useLastLeague(scope, items)
  const goTo = useGoToScope()
  const router = useRouter()
  const active = activeTab(scope)
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
        <Mark className="h-7 text-glass-ink" />
      </div>
      <div className="relative h-16 p-1 md:h-auto md:px-1 md:py-0 lg:px-2">
        {/* The current tab's lozenge: one piece of glass that slides. */}
        <span
          aria-hidden="true"
          data-nav-lozenge
          data-active={active}
          className="glass-nav-lozenge"
          style={{ '--i': Math.max(active, 0) } as React.CSSProperties}
        />
        <ul className="relative flex h-full md:flex-col md:gap-1">
          {TABS.map((t, i) => {
            const target: Scope = t.scope === 'all' ? lastLeague : t.scope
            const current = i === active
            return (
              <li key={t.scope} className="flex flex-1 md:flex-none">
                <a
                  // A real address, so it opens in a new tab like any link.
                  href={
                    router.buildLocation({
                      to: '/',
                      search: { scope: target },
                    }).href
                  }
                  onClick={(e) => {
                    if (
                      e.defaultPrevented ||
                      e.button !== 0 ||
                      e.metaKey ||
                      e.ctrlKey ||
                      e.shiftKey ||
                      e.altKey
                    )
                      return
                    e.preventDefault()
                    // The current tab again: back to its feed, out of any
                    // Game or narrowing (a different League is chosen on
                    // the League row).
                    goTo(target)
                  }}
                  aria-current={current ? 'page' : undefined}
                  aria-label={t.name === t.label ? undefined : t.name}
                  data-scope-tab={t.scope}
                  style={{ '--nav-tone': t.tone } as React.CSSProperties}
                  className={cn(
                    'glass-nav-tab group flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-3xs font-medium text-glass-ink-muted',
                    'md:h-14 md:rounded-card',
                    'lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm',
                    'aria-[current=page]:font-semibold aria-[current=page]:text-glass-ink',
                  )}
                >
                  <span className="glass-nav-icon flex size-7 items-center justify-center">
                    <NavGlyph name={t.icon} className="size-5.5" />
                  </span>
                  {t.label}
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
