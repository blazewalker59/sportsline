import { describe, expect, it } from 'vitest'
import type { SharpPick } from '@/lib/sharp/queries'
import { agentPick } from '@/lib/agents/tools'

const single: SharpPick = {
  id: '2026-10-07:1',
  day: '2026-10-07',
  rank: 1,
  kind: 'single',
  league: 'nhl',
  gameId: 'gm_1',
  startsAt: '2026-10-08T02:00:00Z',
  marketTicker: 'KXNHLGAME-26OCT07EDMANA-EDM',
  side: 'yes',
  marketKind: 'moneyline',
  title: 'EDM win',
  gameLabel: 'EDM @ ANA',
  fair: 0.585,
  price: 0.54,
  fee: 0.02,
  edge: 0.025,
  evPerDollar: 0.0446,
  grade: 'edge',
  sources: [{ source: 'pinnacle', prob: 0.5853 }],
  legs: null,
  form: { lean: 1, note: 'EDM 3-0' },
  worthItUnder: null,
  currentPrice: 0.56,
  currentEdge: 0.005,
  checkedAt: null,
  closingPrice: null,
  result: null,
  createdAt: '2026-10-07T14:00:00Z',
}

describe('agentPick', () => {
  it('reads prices in cents and chances in points, with the Kalshi link', () => {
    expect(agentPick(single)).toMatchObject({
      pick: 'EDM win',
      game: 'EDM @ ANA',
      grade: 'edge',
      priceCents: 54,
      feeCents: 2,
      fairPct: 58.5,
      edgePoints: 2.5,
      evPerDollarPct: 4.5,
      form: 'EDM 3-0',
      side: 'yes',
      marketTicker: 'KXNHLGAME-26OCT07EDMANA-EDM',
      sources: [{ source: 'pinnacle', fairPct: 58.5 }],
      nowCents: 56,
      edgeNowPoints: 0.5,
      closingCents: null,
    })
    expect(agentPick(single)).toHaveProperty(
      'kalshiUrl',
      expect.stringMatching(/^https:\/\/kalshi\.com\//),
    )
  })
})
