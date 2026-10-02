import { describe, expect, it } from 'vitest'
import type { Segment, SegmentKind } from '@/lib/timeline/format'
import { nameForms, segmentDescription } from '@/lib/timeline/format'

/** Just the styled pieces, as [kind, text] (plain text dropped). */
function styled(
  segments: Array<Segment>,
  keep: Array<SegmentKind> = ['player', 'result', 'flag', 'place'],
) {
  return segments
    .filter((s) => keep.includes(s.kind))
    .map((s) => [s.kind, s.text.trim(), s.muted] as const)
}
const text = (segments: Array<Segment>) => segments.map((s) => s.text).join('')

describe('segmentDescription — NFL', () => {
  const players = [
    { name: 'Matthew Stafford' },
    { name: 'Konata Mumpfield' },
    { name: 'Brandon Jones' },
  ]
  const segs = segmentDescription(
    '(No Huddle, Shotgun) M.Stafford pass deep right to K.Mumpfield to LA 43 for 21 yards (B.Jones).',
    'nfl',
    players,
  )

  it('drops formation noise', () => {
    expect(text(segs)).toBe(
      'M.Stafford pass deep right to K.Mumpfield to LA 43 for 21 yards (B.Jones).',
    )
  })

  it('marks who, where and the result, with the tackler muted', () => {
    expect(styled(segs)).toEqual([
      ['player', 'M.Stafford', false],
      ['player', 'K.Mumpfield', false],
      ['place', 'to LA 43', false],
      ['result', 'for 21 yards', false],
      ['player', 'B.Jones', true],
    ])
  })

  it('handles sacks, touchdowns, kicks and drops crew credits', () => {
    expect(
      styled(
        segmentDescription(
          'J.Brissett sacked at SF 32 for 0 yards (O.Okoronkwo).',
          'nfl',
          [{ name: 'Jacoby Brissett' }, { name: 'Ogbo Okoronkwo' }],
        ),
      ),
    ).toEqual([
      ['player', 'J.Brissett', false],
      ['result', 'sacked', false],
      ['place', 'at SF 32', false],
      ['result', 'for 0 yards', false],
      ['player', 'O.Okoronkwo', true],
    ])
    const td = segmentDescription(
      'C.Keenum pass short middle to K.Raymond for 41 yards, TOUCHDOWN. C.Santos extra point is GOOD, Center-S.Daly, Holder-T.Taylor.',
      'nfl',
      [
        { name: 'Case Keenum' },
        { name: 'Kalif Raymond' },
        { name: 'Cairo Santos' },
      ],
    )
    expect(text(td)).toBe(
      'C.Keenum pass short middle to K.Raymond for 41 yards, TOUCHDOWN. C.Santos extra point is GOOD.',
    )
    expect(styled(td, ['result']).map((s) => s[1])).toEqual([
      'for 41 yards',
      'TOUCHDOWN',
      'is GOOD',
    ])
  })

  it('flags penalties', () => {
    const segs2 = segmentDescription(
      'PENALTY on PIT-A.Samuel, Defensive Holding, 5 yards.',
      'nfl',
      [{ name: 'Andrew Samuel' }],
    )
    expect(styled(segs2, ['flag', 'player'])).toEqual([
      ['flag', 'PENALTY on PIT', false],
      ['player', 'A.Samuel', false],
    ])
  })
})

describe('segmentDescription — MLB', () => {
  it('marks batter, fielders, runners, results and where the ball went', () => {
    const segs = segmentDescription(
      'Drake Baldwin doubles (1) on a fly ball to right fielder Bryce Harper. Sean Murphy scores. Ha-Seong Kim to 3rd.',
      'mlb',
      [
        { name: 'Drake Baldwin' },
        { name: 'Bryce Harper' },
        { name: 'Sean Murphy' },
        { name: 'Ha-Seong Kim' },
      ],
    )
    expect(styled(segs)).toEqual([
      ['player', 'Drake Baldwin', false],
      ['result', 'doubles', false],
      ['place', 'on a fly ball to right fielder', false],
      ['player', 'Bryce Harper', false],
      ['player', 'Sean Murphy', false],
      ['result', 'scores', false],
      ['player', 'Ha-Seong Kim', false],
      ['place', 'to 3rd', false],
    ])
    expect(segs.find((s) => s.text === '(1)')?.kind).toBe('aside')
  })

  it('does not treat a name inside another word as a player', () => {
    const segs = segmentDescription('Walker Jenkins grounds out.', 'mlb', [
      { name: 'Walker Jenkins' },
      { name: 'Jen Out' },
    ])
    expect(styled(segs)).toEqual([
      ['player', 'Walker Jenkins', false],
      ['result', 'grounds out', false],
    ])
  })
})

describe('segmentDescription — NHL', () => {
  it('styles goals, faceoffs and penalties', () => {
    expect(
      styled(
        segmentDescription(
          'Penalty, CBJ Carson Soucy: cross checking (2 min), drawn by Jack Quinn.',
          'nhl',
          [{ name: 'Carson Soucy' }, { name: 'Jack Quinn' }],
        ),
      ),
    ).toEqual([
      ['flag', 'Penalty', false],
      ['player', 'Carson Soucy', false],
      ['player', 'Jack Quinn', false],
    ])
    expect(
      styled(
        segmentDescription(
          'MIN Nick Foligno wins the faceoff against Mavrik Bourque.',
          'nhl',
          [{ name: 'Nick Foligno' }, { name: 'Mavrik Bourque' }],
        ),
      ),
    ).toEqual([
      ['player', 'Nick Foligno', false],
      ['result', 'wins the faceoff', false],
      ['player', 'Mavrik Bourque', false],
    ])
  })
})

describe('nameForms', () => {
  it('includes ESPN’s initial-dot form', () => {
    expect(nameForms('Rock Ya-Sin')).toEqual([
      'Rock Ya-Sin',
      'R. Ya-Sin',
      'R.Ya-Sin',
    ])
  })
})
