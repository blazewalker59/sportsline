/**
 * Opening a Player as a sheet over the current screen (PlayerProfile's
 * PlayerSheetProvider), so leaving it lands exactly where the Viewer was.
 */

import { createContext, useContext } from 'react'
import { cn } from '@/lib/utils'

export const OpenPlayer = createContext<(playerId: string) => void>(() => {})

/** Open a Player's sheet over the current screen. */
export function usePlayerSheet(): (playerId: string) => void {
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
