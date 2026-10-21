import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Standings, StandingsRow } from '@/lib/fantasy/standings'
import { StandingsTable } from '@/components/fantasy/LeagueScreen'

const row = (rank: number, over: Partial<StandingsRow> = {}): StandingsRow => ({
  teamId: rank,
  name: `Team ${rank}`,
  abbrev: `T${rank}`,
  logo: null,
  rank,
  wins: 5 - rank,
  losses: rank,
  ties: 0,
  pointsFor: null,
  pointsAgainst: null,
  streak: null,
  mine: false,
  ...over,
})

describe('StandingsTable', () => {
  it('shows points for and against only in a points league', () => {
    const cats: Standings = { rows: [row(1), row(2)], playoffTeams: null }
    expect(
      renderToStaticMarkup(<StandingsTable standings={cats} />),
    ).not.toContain('>PF<')
    const points: Standings = {
      rows: [row(1, { pointsFor: 512.04, pointsAgainst: 430.5 }), row(2)],
      playoffTeams: null,
    }
    const html = renderToStaticMarkup(<StandingsTable standings={points} />)
    expect(html).toContain('>PF<')
    expect(html).toContain('512.0')
    expect(html).toContain('430.5')
  })

  it('marks the Viewer’s team and the playoff cut', () => {
    const html = renderToStaticMarkup(
      <StandingsTable
        standings={{
          rows: [row(1), row(2, { mine: true, streak: 'W2' }), row(3)],
          playoffTeams: 2,
        }}
      />,
    )
    expect(html).toContain('aria-current="true"')
    expect(html).toContain('W2')
    expect(html).toContain('Top 2 make the playoffs.')
  })

  it('adds a ties column only when a team has tied', () => {
    const html = renderToStaticMarkup(
      <StandingsTable
        standings={{ rows: [row(1, { ties: 1 }), row(2)], playoffTeams: null }}
      />,
    )
    expect(html).toContain('W-L-T')
    expect(html).toContain('4-1-1')
  })
})
