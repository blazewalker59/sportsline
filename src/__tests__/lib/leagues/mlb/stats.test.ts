import { describe, expect, it } from 'vitest'
import finalFeed from '../../../fixtures/mlb/final-849848.json'
import type { MlbFeed } from '@/lib/sources/mlb/feed'
import type { SourcePlay } from '@/lib/model/types'
import type {
  BattingLine,
  PitchingLine,
  StatPlay,
} from '@/lib/leagues/mlb/stats'
import {
  formatLine,
  inningsPitched,
  mlbLinesAsOf,
} from '@/lib/leagues/mlb/stats'
import { parseFeed } from '@/lib/sources/mlb/parse'

const feed = finalFeed as unknown as MlbFeed
const snapshot = parseFeed(feed)
const plays: Array<StatPlay> = snapshot.items
  .filter((i): i is SourcePlay => i.kind === 'play')
  .map((p) => ({
    sequence: p.sequence,
    playType: p.playType,
    segmentLabel: p.segmentLabel,
    score: p.score,
    players: p.involved.map((i) => ({ id: i.sourceId, role: i.role })),
    plateAppearance: /^pa:\d+$/.test(p.key),
    // As LiveGame stores them: credits inside the detail, keyed by player id.
    detail: {
      ...(p.detail as object),
      credits: p.credits.map((c) => ({ id: c.sourceId, credit: c.credit })),
    },
  }))
const last = Math.max(...plays.map((p) => p.sequence))

// The Source's final box score is the ground truth for full-game lines.
function boxLine(
  side: 'away' | 'home',
  name: string,
  table: 'Batting' | 'Pitching',
) {
  const abbr =
    side === 'away' ? snapshot.away.abbreviation : snapshot.home.abbreviation
  const t = snapshot.box!.tables.find((x) => x.title === `${abbr} ${table}`)!
  const row = t.rows.find((r) => r.player.name === name)!
  return { id: row.player.sourceId, values: row.values }
}

describe('mlbLinesAsOf', () => {
  it('matches the final box score batting line for every NYY batter', () => {
    const nyy = snapshot.box!.tables.find((t) => t.title === 'NYY Batting')!
    for (const row of nyy.rows) {
      const line = mlbLinesAsOf(plays, row.player.sourceId, last).find(
        (l): l is BattingLine => l.kind === 'batting',
      )
      if (!line) {
        expect(row.values[0]).toBe(0)
        continue
      }
      const [ab, , h, rbi, bb, k] = row.values
      expect({
        name: row.player.name,
        ab: line.ab,
        h: line.h,
        rbi: line.rbi,
        bb: line.bb,
        k: line.k,
      }).toEqual({
        name: row.player.name,
        ab,
        h,
        rbi,
        bb,
        k,
      })
    }
  })

  it('matches the final box score pitching line for every pitcher', () => {
    for (const side of ['away', 'home'] as const) {
      const abbr =
        side === 'away'
          ? snapshot.away.abbreviation
          : snapshot.home.abbreviation
      const t = snapshot.box!.tables.find(
        (x) => x.title === `${abbr} Pitching`,
      )!
      for (const row of t.rows) {
        const line = mlbLinesAsOf(plays, row.player.sourceId, last).find(
          (l): l is PitchingLine => l.kind === 'pitching',
        )!
        const [ip, h, r, er, bb, k] = row.values
        expect({
          name: row.player.name,
          ip: inningsPitched(line.outs),
          h: line.h,
          r: line.r,
          er: line.er,
          bb: line.bb,
          k: line.k,
        }).toEqual({ name: row.player.name, ip, h, r, er, bb, k })
      }
    }
  })

  it('reflects only the Plays up to the given one', () => {
    const bellinger = boxLine('home', 'Cody Bellinger', 'Batting')
    const hr = plays.find(
      (p) =>
        p.sequence === snapshot.items.find((i) => i.key === 'pa:50')!.sequence,
    )!
    const before = mlbLinesAsOf(
      plays,
      bellinger.id,
      hr.sequence - 1,
    )[0] as BattingLine
    const after = mlbLinesAsOf(
      plays,
      bellinger.id,
      hr.sequence,
    )[0] as BattingLine
    expect(after.hr - before.hr).toBe(1)
    expect(after.rbi - before.rbi).toBe(3)
  })

  it('formats summary lines', () => {
    expect(
      formatLine({
        kind: 'batting',
        pa: 5,
        ab: 4,
        h: 2,
        hr: 1,
        rbi: 3,
        bb: 1,
        k: 0,
      }),
    ).toBe('2-4, HR, 3 RBI, BB')
    expect(
      formatLine({
        kind: 'pitching',
        outs: 14,
        h: 3,
        r: 1,
        er: 1,
        bb: 2,
        k: 6,
        pitches: 78,
      }),
    ).toBe('4.2 IP, 3 H, 1 R, 2 BB, 6 K, 78 P')
  })
})
