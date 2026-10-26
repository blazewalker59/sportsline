import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FantasyMove } from '@/lib/fantasy/moves'
import type { MoveOptions } from '@/lib/fantasy/rosterMoves'
import type { AvailablePlayer } from '@/lib/fantasy/freeAgents'
import { AvailablePlayers } from '@/components/fantasy/AvailablePlayers'
import { MoveSheet, outcomeText } from '@/components/fantasy/MoveSheet'

const bub: AvailablePlayer = {
  espnId: 2,
  name: 'Bub Carrington',
  positionId: 1,
  proTeamId: 27,
  teamAbbrev: 'WSH',
  injury: null,
  owned: 12,
  ownedChange: null,
  waivers: true,
  projected: null,
}

const options: MoveOptions = {
  enabled: true,
  roster: [
    {
      espnId: 22,
      name: 'Jordan Clarkson',
      positionId: 2,
      proTeamId: 26,
      teamAbbrev: 'NYK',
      slot: 'Bench',
      starter: false,
      injury: null,
    },
  ],
  budget: { left: 10, total: 100, minimum: 1 },
  moves: [],
}

const move = (over: Partial<FantasyMove>): FantasyMove => ({
  id: 'm',
  kind: 'claim',
  add: { espnId: 2, name: 'Bub Carrington' },
  drop: null,
  bid: 3,
  status: 'pending',
  reason: null,
  createdAt: 'x',
  updatedAt: 'x',
  ...over,
})

describe('AvailablePlayers with roster moves on', () => {
  it('offers a claim for a waiver Player and an add for a free agent', () => {
    const html = renderToStaticMarkup(
      <AvailablePlayers
        sport="basketball"
        provider="espn"
        available={{
          order: 'owned',
          players: [
            bub,
            { ...bub, espnId: 3, name: 'Free Guy', waivers: false },
          ],
        }}
        onMove={() => {}}
      />,
    )
    expect(html).toContain('aria-label="Claim Bub Carrington"')
    expect(html).toContain('aria-label="Add Free Guy"')
    // A claim a shade deeper than an add; its row doesn't say waivers again.
    expect(html).toMatch(
      /aria-label="Claim Bub Carrington"[^>]*bg-foreground\/15/,
    )
    expect(html).toMatch(/aria-label="Add Free Guy"[^>]*bg-notice/)
    expect(html).not.toContain('Waivers')
  })
})

describe('MoveSheet', () => {
  it('asks who to drop and the bid, and says the move before Confirm', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MoveSheet
          leagueId="l"
          sport="basketball"
          options={options}
          intent={{ kind: 'claim', player: bub }}
          onClose={() => {}}
        />
      </QueryClientProvider>,
    )
    expect(html).toContain('Waiver claim')
    expect(html).toContain('Don’t drop anyone')
    expect(html).toContain('Jordan Clarkson')
    expect(html).toContain('$10 of $100 left')
    expect(html).toContain('Confirm: Claim Bub Carrington ($1)')
  })
})

describe('outcomeText', () => {
  it('says what came of a move', () => {
    expect(outcomeText(move({}))).toContain('waits for the league’s waivers')
    expect(
      outcomeText(move({ status: 'refused', reason: 'Roster full' })),
    ).toBe('ESPN didn’t make it: Roster full')
    expect(outcomeText(move({ status: 'unknown' }))).toContain(
      'It may have gone through',
    )
    expect(outcomeText(move({ kind: 'add', bid: null, status: 'done' }))).toBe(
      'Done: Add Bub Carrington.',
    )
  })
})
