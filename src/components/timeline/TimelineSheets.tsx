/**
 * The sheets the Timeline opens over itself: a Play, a Matchup, a
 * Prediction, the portfolio, the catch-up, what's live now, and the
 * selected Game's box score. Each opens only when asked for and its
 * subject still exists.
 */

import { CatchUpSheet } from './CatchUp'
import { TypingRow } from './FeedRows'
import type { Typing } from '@/lib/timeline/chat'
import type { GameSummary } from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'
import type { CatchUp } from '@/lib/timeline/catchup'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { PredictionView } from '@/lib/kalshi/predictionViews'
import type { LeagueMatchup } from '@/lib/fantasy/matchup'
import type { ChangeDisplay } from '@/lib/kalshi/server'
import { MatchupSheet } from '@/components/fantasy/FantasyParts'
import { PredictionSheet } from '@/components/predictions/PredictionSheet'
import { PortfolioSheet } from '@/components/predictions/PredictionPortfolio'
import { PlaySheet } from '@/components/games/PlayDetailScreen'
import { BoxSheet } from '@/components/games/GameView'
import { Sheet } from '@/components/chat/Sheet'

export function TimelineSheets({
  playId,
  onPlayClose,
  matchup,
  otherMatchup,
  games,
  onMatchupClose,
  onMatchupOther,
  prediction,
  onPredictionClose,
  onPredictionNavigate = onPredictionClose,
  portfolio = null,
  display = 'dollars',
  onPortfolioClose = () => {},
  onPortfolioOpen,
  recap,
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
  /** Another Matchup in that league, in place of the Viewer's. */
  otherMatchup?: LeagueMatchup
  /** Today's Games, for each Starter's game state. */
  games: Array<GameSummary>
  onMatchupClose: () => void
  /**
   * Move the Matchup's sheet to another in its league (or back to the
   * Viewer's): given, the sheet lists them (where no cards do).
   */
  onMatchupOther?: (other: LeagueMatchup | undefined) => void
  prediction: PredictionView | null
  onPredictionClose: () => void
  /** One of its links was followed (by default, it closes). */
  onPredictionNavigate?: () => void
  /** The open Predictions, when the portfolio's sheet is open. */
  portfolio?: ReadonlyArray<PredictionView> | null
  /** Profit or loss in dollars or percent return. */
  display?: ChangeDisplay
  onPortfolioClose?: () => void
  /** One Prediction picked from the portfolio. */
  onPortfolioOpen?: (id: string) => void
  /** The catch-up, when its sheet is open. */
  recap: CatchUp | null
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
        <MatchupSheet
          key={`${matchup.id}:${otherMatchup?.left.teamId ?? 'mine'}`}
          league={matchup}
          other={otherMatchup}
          games={games}
          onClose={onMatchupClose}
          onOther={onMatchupOther}
        />
      )}

      {prediction && (
        <PredictionSheet
          prediction={prediction}
          onClose={onPredictionClose}
          onNavigate={onPredictionNavigate}
        />
      )}

      {portfolio && (
        <PortfolioSheet
          predictions={portfolio}
          display={display}
          onClose={onPortfolioClose}
          onOpen={onPortfolioOpen}
        />
      )}

      {recap && <CatchUpSheet catchUp={recap} onClose={onRecapClose} />}

      {live && (
        <Sheet title={`Live now · ${live.length}`} onClose={onLiveClose}>
          <ol className="flex flex-col gap-3">
            {live.map(({ typing: t, game: g }) => (
              <li key={g.id}>
                <TypingRow
                  typing={t}
                  game={g}
                  focused={false}
                  onClick={onLiveClose}
                />
              </li>
            ))}
          </ol>
        </Sheet>
      )}

      {boxGame && <BoxSheet game={boxGame} box={box} onClose={onBoxClose} />}
    </>
  )
}
