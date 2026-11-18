import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { PlayDetailScreen } from '@/components/games/PlayDetailScreen'
import {
  NotFoundPanel,
  RouteErrorPanel,
  RoutePending,
} from '@/components/layout/RouteStates'
import { playDetailQuery } from '@/lib/games/queries'
import { playSearch } from '@/lib/timeline/gameLink'

export const Route = createFileRoute('/plays/$playId')({
  // Old Play Detail links open the Play as a sheet over the Timeline: read
  // it (which leaves it cached for the sheet) and go straight there. No
  // such Play (or a Removal) is a not-found; a failed read is an error.
  loader: async ({ context, params: { playId } }) => {
    if (!context.viewerState?.viewer) return
    const detail = await context.queryClient.ensureQueryData(
      playDetailQuery(playId),
    )
    if (!detail) throw notFound()
    throw redirect({
      to: '/',
      search: playSearch(playId, detail.item.sportsDay),
      replace: true,
    })
  },
  component: function PlayRoute() {
    const { playId } = Route.useParams()
    return <PlayDetailScreen key={playId} playId={playId} />
  },
  // The loader waits for the Play, in the browser too.
  pendingComponent: () => <RoutePending />,
  errorComponent: RouteErrorPanel,
  notFoundComponent: () => <NotFoundPanel what="play" />,
})
