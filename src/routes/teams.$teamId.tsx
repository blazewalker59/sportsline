import { createFileRoute } from '@tanstack/react-router'
import { TeamScreen } from '@/components/teams/TeamScreen'
import { warm } from '@/lib/routeLoad'
import { teamPageQuery } from '@/lib/teams/queries'

export const Route = createFileRoute('/teams/$teamId')({
  loader: ({ context, params: { teamId } }) => {
    if (!context.viewerState?.viewer) return
    return warm(context.queryClient.prefetchQuery(teamPageQuery(teamId)))
  },
  component: function TeamRoute() {
    const { teamId } = Route.useParams()
    return <TeamScreen teamId={teamId} />
  },
})
