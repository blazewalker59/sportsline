/**
 * Opening a Player as a sheet over the current screen (PlayerSheetProvider),
 * so leaving it lands exactly where the Viewer was.
 */

import { useContext } from 'react'
import { OpenPlayer } from './PlayerSheetProvider'
import { cn } from '@/lib/utils'

/** Open a Player's sheet over the current screen. */
function usePlayerSheet(): (playerId: string) => void {
  return useContext(OpenPlayer)
}

/**
 * Anything naming a Player, as a button that opens their sheet: the one
 * way every screen opens a Player. One not matched to ours yet (no id)
 * reads the same, without the button.
 */
export function PlayerButton({
  playerId,
  className,
  children,
}: {
  playerId: string | null | undefined
  className?: string
  children: React.ReactNode
}) {
  const openPlayer = usePlayerSheet()
  if (!playerId) return <span className={className}>{children}</span>
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openPlayer(playerId)
      }}
      className={cn('text-left', className)}
    >
      {children}
    </button>
  )
}
