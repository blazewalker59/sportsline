import { describe, expect, it } from 'vitest'
import {
  DELETE_ITEMS,
  RETENTION_DAYS,
  retentionCutoff,
} from '@/lib/live/retention'

describe('retention', () => {
  it('keeps 30 Sports Days of Routine Plays', () => {
    expect(RETENTION_DAYS).toBe(30)
    // 2 Oct, 3pm ET is the 2 Oct Sports Day: plays before 2 Sept are trimmed.
    expect(retentionCutoff(new Date('2026-10-02T19:00:00Z'))).toBe('2026-09-02')
  })

  it('only ever deletes Routine Plays nobody reacted to', () => {
    expect(DELETE_ITEMS).toContain("kind = 'play'")
    expect(DELETE_ITEMS).toContain("significance = 'routine'")
    expect(DELETE_ITEMS).toContain('from reactions')
  })
})
