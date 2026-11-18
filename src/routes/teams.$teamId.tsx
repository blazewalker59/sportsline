import { createFileRoute, notFound } from '@tanstack/react-router'
import { NotFoundPanel, RouteErrorPanel } from '@/components/layout/RouteStates'
import { TeamScreen } from '@/components/teams/TeamScreen'
import { warm } from '@/lib/routeLoad'
import { teamPageQuery } from '@/lib/teams/queries'

export const Route = createFileRoute('/teams/$teamId')({
  // Only warms the cache in the browser (the screen shows its own loading),
  // so there's no pendingComponent. Where the read has already answered
  // (always on the server), no such Team is a not-found.
  loader: async ({ context, params: { teamId } }) => {
    if (!context.viewerState?.viewer) return
    const { queryClient } = context
    const page = teamPageQuery(teamId)
    await warm(queryClient.prefetchQuery(page))
    if (queryClient.getQueryData(page.queryKey) === null) throw notFound()
  },
  component: function TeamRoute() {
    const { teamId } = Route.useParams()
    return <TeamScreen teamId={teamId} />
  },
  errorComponent: RouteErrorPanel,
  notFoundComponent: () => <NotFoundPanel what="team" />,
})
