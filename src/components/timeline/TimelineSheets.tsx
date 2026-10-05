/**
 * The sheets the Timeline opens over itself: a Play, a Matchup, a
 * Prediction, the catch-up, what's live now, and the selected Game's box
 * score. Each opens only when asked for and its subject still exists.
 */

import { CatchUpSheet } from './CatchUp'
import { TypingRow } from './FeedRows'
import type { Typing } from '@/lib/timeline/chat'
import type { GameSummary } from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'
import type { CatchUp } from '@/lib/timeline/catchup'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { PredictionView } from '@/lib/kalshi/server'
import { MatchupSheet } from '@/components/fantasy/FantasyParts'
import { PredictionSheet } from '@/components/predictions/PredictionParts'
import { PlaySheet } from '@/components/games/PlayDetailScreen'
import { BoxSheet } from '@/components/games/GameView'
import { Sheet } from '@/components/chat/Sheet'

export function TimelineSheets({
  playId,
  onPlayClose,
  matchup,
  games,
  onMatchupClose,
  prediction,
  onPredictionClose,
  recap,
  now,
  onRecapClose,
  live,
  onLiveClose,
  boxGame,
  box,
  onBoxClose,
}: {
  playId: string | null
  onPlayClose: () => void
  /** The Matchup whose sheet is open, if any. */
  matchup: FantasyLeagueView | null
  /** Today's Games, for each Starter's game state. */
  games: Array<GameSummary>
  onMatchupClose: () => void
  prediction: PredictionView | null
  onPredictionClose: () => void
  /** The catch-up, when its sheet is open. */
  recap: CatchUp | null
  now: number
  onRecapClose: () => void
  /** The live Games, when their sheet is open (two or more). */
  live: Array<{ typing: Typing; game: GameSummary }> | null
  onLiveClose: () => void
  /** The selected Game, when its box score is open. */
  boxGame: GameSummary | null
  box: GameBox | null
  onBoxClose: () => void
}) {
  return (
    <>
      {playId && <PlaySheet playId={playId} onClose={onPlayClose} />}

      {matchup && (
        <MatchupSheet league={matchup} games={games} onClose={onMatchupClose} />
      )}

      {prediction && (
        <PredictionSheet prediction={prediction} onClose={onPredictionClose} />
      )}

      {recap && (
        <CatchUpSheet catchUp={recap} now={now} onClose={onRecapClose} />
      )}

      {live && (
        <Sheet title={`Live now · ${live.length}`} onClose={onLiveClose}>
          <ol className="flex flex-col gap-3">
            {live.map(({ typing: t, game: g }) => (
              <li key={g.id} onClick={onLiveClose}>
                <TypingRow typing={t} game={g} focused={false} />
              </li>
            ))}
          </ol>
        </Sheet>
      )}

      {boxGame && <BoxSheet game={boxGame} box={box} onClose={onBoxClose} />}
    </>
  )
}
