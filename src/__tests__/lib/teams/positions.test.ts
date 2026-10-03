import { describe, expect, it } from 'vitest'
import { rosterGroups } from '@/lib/teams/positions'

describe('rosterGroups', () => {
  it("groups in the sport's order, names A–Z, unknowns last", () => {
    const groups = rosterGroups('nhl', [
      { name: 'Zed', position: 'G' },
      { name: 'Ann', position: 'D' },
      { name: 'Bob', position: 'C' },
      { name: 'Al', position: 'C' },
      { name: 'Mo', position: null },
    ])
    expect(groups.map((g) => g.label)).toEqual([
      'Centers',
      'Defense',
      'Goalies',
      'Other',
    ])
    expect(groups[0].players.map((p) => p.name)).toEqual(['Al', 'Bob'])
  })

  it('reads football positions into units', () => {
    const groups = rosterGroups('cfb', [
      { name: 'K', position: 'PK' },
      { name: 'Q', position: 'QB' },
      { name: 'C', position: 'CB' },
    ])
    expect(groups.map((g) => g.label)).toEqual([
      'Quarterbacks',
      'Defensive backs',
      'Special teams',
    ])
  })
})
