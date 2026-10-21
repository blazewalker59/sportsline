import { createFileRoute } from '@tanstack/react-router'
import { LeagueScreen } from '@/components/fantasy/LeagueScreen'
import { warm } from '@/lib/routeLoad'
import { fantasyLeagueQuery } from '@/lib/fantasy/leagueQuery'

export const Route = createFileRoute('/fantasy_/$leagueId')({
  loader: ({ context, params: { leagueId } }) => {
    if (!context.viewerState?.viewer) return
    return warm(context.queryClient.prefetchQuery(fantasyLeagueQuery(leagueId)))
  },
  component: function FantasyLeagueRoute() {
    const { leagueId } = Route.useParams()
    return <LeagueScreen leagueId={leagueId} />
  },
})
