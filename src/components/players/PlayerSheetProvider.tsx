/**
 * Opening a Player as a sheet over the current screen, so leaving it lands
 * exactly where the Viewer was. The provider sits at the root, in the app's
 * entry, so it stays light: the sheet itself (PlayerProfile) loads on its
 * own, on idle. Open one with playerSheet's PlayerButton.
 */

import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useEffect,
  useState,
} from 'react'

export const OpenPlayer = createContext<(playerId: string) => void>(() => {})

const loadSheet = () =>
  import('./PlayerProfile').then((m) => ({ default: m.PlayerSheet }))
const PlayerSheet = lazy(loadSheet)

export function PlayerSheetProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const close = useCallback(() => setPlayerId(null), [])
  // Fetch the sheet once the app is idle, so the first tap opens it at once.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 2000))
    idle(() => void loadSheet())
  }, [])
  return (
    <OpenPlayer.Provider value={setPlayerId}>
      {children}
      {playerId && (
        <Suspense fallback={null}>
          <PlayerSheet key={playerId} playerId={playerId} onClose={close} />
        </Suspense>
      )}
    </OpenPlayer.Provider>
  )
}
