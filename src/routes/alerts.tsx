import { createFileRoute } from '@tanstack/react-router'
import { AlertsScreen } from '@/components/alerts/AlertsScreen'

export const Route = createFileRoute('/alerts')({
  component: AlertsScreen,
})
