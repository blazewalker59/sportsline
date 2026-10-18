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

/** Anything naming a Player, as a button that opens their sheet. */
export function PlayerButton({
  playerId,
  className,
  children,
}: {
  playerId: string
  className?: string
  children: React.ReactNode
}) {
  const openPlayer = usePlayerSheet()
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
