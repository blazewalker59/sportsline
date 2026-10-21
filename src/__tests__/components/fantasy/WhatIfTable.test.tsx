import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WhatIfRow } from '@/lib/fantasy/whatIf'
import { WhatIfTable } from '@/components/fantasy/WhatIfTable'

const row = (teamId: number, over: Partial<WhatIfRow> = {}): WhatIfRow => ({
  teamId,
  name: `Team ${teamId}`,
  abbrev: `T${teamId}`,
  wins: 3,
  losses: 3,
  ties: 0,
  whatIfWins: 3,
  whatIfLosses: 3,
  whatIfTies: 0,
  benchLeft: 40.25,
  flips: 0,
  oneMoveFlips: 0,
  weeks: 6,
  ...over,
})

describe('WhatIfTable', () => {
  it('sets each team’s what-if record beside its real one', () => {
    const html = renderToStaticMarkup(
      <WhatIfTable
        whatIf={{
          weeks: 6,
          rows: [
            row(1, {
              whatIfWins: 5,
              whatIfLosses: 1,
              flips: 2,
              oneMoveFlips: 1,
            }),
            row(2),
          ],
        }}
        mine={1}
      />,
    )
    expect(html).toContain('5-1')
    expect(html).toContain('+2')
    expect(html).toContain('3-3')
    expect(html).toContain('40.3')
    expect(html).toContain('(1 by one swap)')
    expect(html).toContain('aria-current="true"')
    expect(html).toContain('Over 6 finished weeks')
  })

  it('waits for a finished week', () => {
    expect(
      renderToStaticMarkup(
        <WhatIfTable whatIf={{ weeks: 0, rows: [] }} mine={null} />,
      ),
    ).toContain('once a week of the season is finished')
  })
})
