import { createFileRoute } from '@tanstack/react-router'
import { PredictionsScreen } from '@/components/predictions/PredictionsScreen'

export const Route = createFileRoute('/predictions')({
  component: PredictionsScreen,
})
