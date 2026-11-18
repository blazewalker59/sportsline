import { createFileRoute, notFound } from '@tanstack/react-router'
import { LeagueScreen } from '@/components/fantasy/LeagueScreen'
import { NotFoundPanel, RouteErrorPanel } from '@/components/layout/RouteStates'
import { warm } from '@/lib/routeLoad'
import { fantasyLeagueQuery } from '@/lib/fantasy/leagueQuery'

export const Route = createFileRoute('/fantasy_/$leagueId')({
  // Only warms the cache in the browser (the screen shows its own loading),
  // so there's no pendingComponent. Where the read has already answered
  // (always on the server), no such Fantasy league of the Viewer's is a
  // not-found.
  loader: async ({ context, params: { leagueId } }) => {
    if (!context.viewerState?.viewer) return
    const { queryClient } = context
    const page = fantasyLeagueQuery(leagueId)
    await warm(queryClient.prefetchQuery(page))
    if (queryClient.getQueryData(page.queryKey) === null) throw notFound()
  },
  component: function FantasyLeagueRoute() {
    const { leagueId } = Route.useParams()
    return <LeagueScreen leagueId={leagueId} />
  },
  errorComponent: RouteErrorPanel,
  notFoundComponent: () => <NotFoundPanel what="fantasy league" />,
})
