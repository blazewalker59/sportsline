import { createFileRoute } from '@tanstack/react-router'
import { FollowsScreen } from '@/components/follows/FollowsScreen'

export const Route = createFileRoute('/follows')({
  component: FollowsScreen,
})
