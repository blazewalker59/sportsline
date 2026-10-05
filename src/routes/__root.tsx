import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'
import { THEME_BOOT, THEME_COLOR_BOOT } from '../lib/theme'

import type { QueryClient } from '@tanstack/react-query'
import { PlayerSheetProvider } from '@/components/players/PlayerProfile'
import { Landing } from '@/components/landing/Landing'
import { useViewer } from '@/lib/viewer/useViewer'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'Sportsline' },
      { name: 'theme-color', content: '#f3f4f8' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      {
        name: 'apple-mobile-web-app-status-bar-style',
        // Lay the installed app out below the status bar: anything drawn
        // under it gets iOS's scroll-edge blur. The bar takes theme-color.
        content: 'default',
      },
      { name: 'apple-mobile-web-app-title', content: 'Sportsline' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      {
        name: 'description',
        content: 'Live play-by-play across MLB, NBA, NFL and NHL.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  shellComponent: RootDocument,
  component: Gate,
  notFoundComponent: () => (
    <p className="p-8 text-center text-muted">Page not found.</p>
  ),
})

/**
 * Sportsline is for signed-in Viewers: a visitor sees the Landing, a
 * Viewer the app (where a Player opens as a sheet over any screen). Local
 * preview pages (/zz-dev…) skip the gate in development.
 */
function Gate() {
  const viewer = useViewer()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  if (import.meta.env.DEV && pathname.startsWith('/zz-dev')) return <Outlet />
  if (viewer.isPending) return <Splash />
  if (!viewer.data?.viewer) return <Landing />
  return (
    <PlayerSheetProvider>
      <Outlet />
    </PlayerSheetProvider>
  )
}

/** While the session is checked: the wordmark, nothing to flash. */
function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <img
        src="/favicon.svg"
        alt="Sportsline"
        width={44}
        height={44}
        className="animate-pulse"
      />
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // The boot script sets the theme class before hydration, so the
    // server-rendered class differs by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_COLOR_BOOT }} />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
