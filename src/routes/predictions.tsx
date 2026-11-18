import { createFileRoute } from '@tanstack/react-router'
import { RouteErrorPanel } from '@/components/layout/RouteStates'
import { PredictionsScreen } from '@/components/predictions/PredictionsScreen'

export const Route = createFileRoute('/predictions')({
  component: PredictionsScreen,
  errorComponent: RouteErrorPanel,
})
