import { createFileRoute } from '@tanstack/react-router'
import { RouteErrorPanel } from '@/components/layout/RouteStates'
import { FollowsScreen } from '@/components/follows/FollowsScreen'

export const Route = createFileRoute('/follows')({
  component: FollowsScreen,
  errorComponent: RouteErrorPanel,
})
