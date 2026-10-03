import { describe, expect, it } from 'vitest'
import { lightLogo } from '@/lib/brand/logos'

describe('lightLogo', () => {
  it("finds each Source's light-background mark", () => {
    expect(
      lightLogo(
        'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500-dark/nyj.png&w=80&h=80',
      ),
    ).toBe(
      'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/nyj.png&w=80&h=80',
    )
    expect(
      lightLogo(
        'https://www.mlbstatic.com/team-logos/team-cap-on-dark/143.svg',
      ),
    ).toBe('https://www.mlbstatic.com/team-logos/team-cap-on-light/143.svg')
    expect(
      lightLogo('https://assets.nhle.com/logos/nhl/svg/TOR_dark.svg'),
    ).toBe('https://assets.nhle.com/logos/nhl/svg/TOR_light.svg')
    expect(lightLogo('https://example.com/x.png')).toBeNull()
    expect(lightLogo(null)).toBeNull()
  })
})
