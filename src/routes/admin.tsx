import { createFileRoute } from '@tanstack/react-router'
import { RouteErrorPanel } from '@/components/layout/RouteStates'
import { AdminScreen } from '@/components/admin/AdminScreen'

export const Route = createFileRoute('/admin')({
  component: AdminScreen,
  errorComponent: RouteErrorPanel,
})
