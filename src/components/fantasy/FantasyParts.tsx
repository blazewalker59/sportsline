/**
 * Fantasy (CONTEXT.md, "Matchup") in the Timeline: a strip of Matchup
 * cards, a sheet with both Lineups, and the tag that marks a play as one
 * of the Viewer's Starters' or their opponent's. The parts live in their
 * own modules; this keeps their one import path.
 */

export { Breakdown } from './Breakdown'
export { injuryLabel, injuryTone } from './format'
export { MatchupSheet } from './MatchupSheet'
export { FantasyStrip } from './MatchupStrip'
export { FantasyTag, FantasyTagsProvider } from './tags'
