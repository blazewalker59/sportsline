import { createFileRoute } from '@tanstack/react-router'
import { FantasyScreen } from '@/components/fantasy/FantasyScreen'

export const Route = createFileRoute('/fantasy')({
  component: FantasyScreen,
})
