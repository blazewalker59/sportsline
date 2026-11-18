import { createFileRoute } from '@tanstack/react-router'
import { RouteErrorPanel } from '@/components/layout/RouteStates'
import { AlertsScreen } from '@/components/alerts/AlertsScreen'

export const Route = createFileRoute('/alerts')({
  component: AlertsScreen,
  errorComponent: RouteErrorPanel,
})
