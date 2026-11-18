import { createFileRoute } from '@tanstack/react-router'
import { RouteErrorPanel } from '@/components/layout/RouteStates'
import { FantasyScreen } from '@/components/fantasy/FantasyScreen'

export const Route = createFileRoute('/fantasy')({
  component: FantasyScreen,
  errorComponent: RouteErrorPanel,
})
