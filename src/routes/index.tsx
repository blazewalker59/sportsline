import { createFileRoute } from '@tanstack/react-router'
import { TimelineScreen } from '@/components/timeline/TimelineScreen'

export const Route = createFileRoute('/')({
  component: TimelineScreen,
})
