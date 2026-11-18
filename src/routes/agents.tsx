import { createFileRoute } from '@tanstack/react-router'
import { RouteErrorPanel } from '@/components/layout/RouteStates'
import { AgentsScreen } from '@/components/agents/AgentsScreen'

export const Route = createFileRoute('/agents')({
  component: AgentsScreen,
  errorComponent: RouteErrorPanel,
})
