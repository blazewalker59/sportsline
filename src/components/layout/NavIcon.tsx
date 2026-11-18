/**
 * The app's section icons, shared by the main navigation (AppNav) and the
 * account menu (AppHeader), each in its section's color.
 */

import { cn } from '@/lib/utils'

export type IconName =
  | 'all'
  | 'follows'
  | 'reactions'
  | 'predictions'
  | 'fantasy'
  | 'alerts'
  | 'agents'
  | 'health'
  | 'signOut'

/** Each section's color, so items read apart at a glance. */
export const ICON_TONES: Record<IconName, string> = {
  all: 'bg-accent/15 text-accent',
  follows: 'bg-accent/15 text-accent',
  reactions: 'bg-section-reactions/15 text-section-reactions',
  predictions: 'bg-section-predictions/15 text-section-predictions',
  fantasy: 'bg-section-fantasy/15 text-section-fantasy',
  alerts: 'bg-section-alerts/15 text-section-alerts',
  agents: 'bg-section-agents/15 text-section-agents',
  health: 'bg-section-health/15 text-section-health',
  signOut: 'bg-live/10 text-live',
}

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  // Every League: four tiles.
  all: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  follows: (
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
  ),
  reactions: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  predictions: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  fantasy: (
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
  ),
  alerts: (
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
  ),
  agents: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="3" />
      <path d="M12 8V4M9.5 13h.01M14.5 13h.01M3 13v2M21 13v2" />
    </>
  ),
  health: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  signOut: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
}

/** The bare icon, in the current text color. */
export function NavGlyph({
  name,
  className,
}: {
  name: IconName
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn(
        'size-4 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]',
        className,
      )}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}
