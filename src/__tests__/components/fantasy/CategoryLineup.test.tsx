import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import basketball from '../../fixtures/fantasy/basketball-category-matchup.json'
import type { MatchupView, WireLeague } from '@/lib/fantasy/matchup'
import { CategoryLineup } from '@/components/fantasy/CategoryLineup'
import { readMatchup } from '@/lib/fantasy/matchup'

const view = (): MatchupView =>
  readMatchup('basketball', basketball as unknown as WireLeague, 1)!

const render = (m: MatchupView) =>
  renderToStaticMarkup(
    <CategoryLineup
      sport="basketball"
      categories={m.categories!}
      mine={m.mine}
      opponent={m.opponent}
      lineups={{ mine: m.mine.lineup, theirs: m.opponent!.lineup }}
      games={[]}
      knowsGames={false}
    />,
  )

describe('CategoryLineup', () => {
  it('shows the Viewer’s side as a box score: a column per category', () => {
    const m = view()
    const html = render(m)
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-selected="true"')
    for (const label of [
      'FG',
      'FT',
      '3PM',
      'REB',
      'AST',
      'STL',
      'BLK',
      'TO',
      'PTS',
    ])
      expect(html).toContain(`>${label}</th>`)
    // The Viewer's Starters, by name, and their totals: 21/40 from the floor.
    const starter = m.mine.lineup.find((p) => p.starter)!
    expect(html).toContain(starter.name.split(' ').at(-1))
    expect(html).toContain('>Starters</th>')
    expect(html).toContain('21/40')
    // The opponent's Players aren't in the Viewer's table.
    const theirs = m.opponent!.lineup.find(
      (p) => !m.mine.lineup.some((q) => q.name === p.name),
    )!
    expect(html).not.toContain(theirs.name.split(' ').at(-1))
  })

  it('dims the bench, and dashes a Player with no line', () => {
    const m = view()
    const base = m.mine.lineup[0]
    const extra = (name: string, starter: boolean, espnId: number) => ({
      ...base,
      espnId,
      name,
      starter,
      slot: starter ? 'UTIL' : 'Bench',
      slotId: starter ? 11 : 12,
      playerId: null,
      dayStats: {},
    })
    m.mine.lineup = [
      ...m.mine.lineup,
      extra('Idle Starter', true, 901),
      extra('Bench Guy', false, 902),
    ]
    const rows = [...render(m).matchAll(/<tr[^>]*>.*?<\/tr>/g)].map((r) => r[0])
    const row = (name: string) => rows.find((r) => r.includes(name))!
    expect(row('B. Guy')).toContain('opacity-50')
    expect(row('B. Guy')).toContain('>BN<')
    expect(row('I. Starter')).not.toContain('opacity-50')
    expect(row('I. Starter')).toContain('–')
    // Bench comes after the Starters' totals.
    const order = rows.map((r) =>
      r.includes('>Starters</th>')
        ? 'totals'
        : r.includes('B. Guy')
          ? 'bench'
          : '',
    )
    expect(order.indexOf('bench')).toBeGreaterThan(order.indexOf('totals'))
  })
})
