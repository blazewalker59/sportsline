import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WhoHasView } from '@/lib/fantasy/server'
import { WhoHasCard } from '@/components/fantasy/WhoHas'

const noop = () => {}

const encounter: WhoHasView = {
  id: 'e1',
  sport: 'football',
  leagueName: 'Dynasty',
  player: { espnId: 3918298, name: 'Josh Allen', positionId: 1, proTeamId: 2 },
  status: 'OUT',
  options: [
    { teamId: 3, name: 'Bronx Bombers' },
    { teamId: 4, name: 'Taco Corp' },
    { teamId: 5, name: 'Gridiron Gang' },
    { teamId: 6, name: 'Hail Marys' },
  ],
}

describe('WhoHasCard', () => {
  it('asks which team has the Player, with four to choose from', () => {
    const html = renderToStaticMarkup(
      <WhoHasCard
        encounter={encounter}
        result={null}
        onPick={noop}
        onDone={noop}
      />,
    )
    expect(html).toContain('Josh Allen')
    expect(html).toContain('Ruled out')
    expect(html).toContain('Which team in Dynasty has Josh Allen?')
    for (const o of encounter.options) expect(html).toContain(o.name)
    expect(html).not.toContain('disabled')
  })

  it('says it was right, with the record', () => {
    const html = renderToStaticMarkup(
      <WhoHasCard
        encounter={encounter}
        result={{ pick: 4, ownerTeamId: 4, record: { right: 5, answered: 7 } }}
        onPick={noop}
        onDone={noop}
      />,
    )
    expect(html).toContain('Right!')
    expect(html).toContain('You’re 5 for 7.')
    expect(html).toContain('disabled')
  })

  it('names the owner after a wrong guess', () => {
    const html = renderToStaticMarkup(
      <WhoHasCard
        encounter={encounter}
        result={{ pick: 3, ownerTeamId: 6, record: { right: 0, answered: 1 } }}
        onPick={noop}
        onDone={noop}
      />,
    )
    expect(html).toContain('Not quite.')
    expect(html).toContain('Hail Marys has them.')
  })
})
