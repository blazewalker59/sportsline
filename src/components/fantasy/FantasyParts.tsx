/**
 * Fantasy (CONTEXT.md, "Matchup") in the Timeline: a sheet with both
 * Lineups (a play's Starter tag is the
 * feed's, chat/StakeTags). The parts live in their own modules; this
 * keeps their one import path.
 */

export { Breakdown } from './Breakdown'
export { injuryLabel, injuryTone } from './format'
export { MatchupDetail, MatchupSheet } from './MatchupSheet'
