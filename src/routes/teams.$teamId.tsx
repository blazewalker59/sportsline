import { createFileRoute } from '@tanstack/react-router'
import { TeamScreen } from '@/components/teams/TeamScreen'

export const Route = createFileRoute('/teams/$teamId')({
  component: function TeamRoute() {
    const { teamId } = Route.useParams()
    return <TeamScreen teamId={teamId} />
  },
})
