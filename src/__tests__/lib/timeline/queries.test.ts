import { describe, expect, it, vi } from 'vitest'
import type { FollowEntry, ViewerState } from '@/lib/viewer/server'
import { DEFAULT_LEAGUE_SETTINGS } from '@/lib/model/leagues'
import { openingFollowParam } from '@/lib/timeline/queries'

vi.mock('@/lib/timeline/server', () => ({
  getTimeline: vi.fn(),
  getGames: vi.fn(),
}))

const phillies: FollowEntry = {
  follow: { kind: 'team', teamId: 'phi' },
  label: 'Phillies',
  detail: null,
  league: 'mlb',
  logoUrl: null,
}

function state(
  follows: Array<FollowEntry>,
  hidden: ViewerState['leagues']['hidden'] = [],
): ViewerState {
  return {
    viewer: { id: 'v', name: 'V', image: null, email: 'v@example.com' },
    follows,
    readAt: null,
    leagues: { ...DEFAULT_LEAGUE_SETTINGS, hidden },
  }
}

describe('openingFollowParam', () => {
  it('opens on Following for a Viewer who follows something', () => {
    expect(openingFollowParam(state([phillies]), undefined)).toBe('team:phi')
  })

  it('opens on All, without hidden Leagues, otherwise', () => {
    const param = openingFollowParam(state([], ['nba']), undefined)
    expect(param).toContain('league:mlb')
    expect(param).not.toContain('league:nba')
    // Following with nothing followed is All too.
    expect(openingFollowParam(state([], ['nba']), 'following')).toBe(param)
  })

  it('takes the Scope asked for', () => {
    expect(openingFollowParam(state([phillies]), 'nhl')).toBe('league:nhl')
  })

  it('leaves Scopes that load in the browser alone', () => {
    expect(openingFollowParam(state([phillies]), 'predictions')).toBeNull()
    expect(openingFollowParam(state([phillies]), 'fantasy')).toBeNull()
  })
})
