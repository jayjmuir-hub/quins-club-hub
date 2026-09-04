import { describe, it, expect } from 'vitest'
import { seasonLabelFor } from '../src/lib/season.js'

describe('seasonLabelFor — 1 Sep to 31 Aug, in club time', () => {
  it('a September date is the season that starts that year', () => {
    expect(seasonLabelFor(new Date('2026-09-04T08:00:00Z'))).toBe('2026-27')
  })
  it('a January date belongs to the season that started the previous September', () => {
    expect(seasonLabelFor(new Date('2027-01-15T08:00:00Z'))).toBe('2026-27')
  })
  it('⚠️ 23:30 on 31 Aug DUBAI is still the old season', () => {
    // 19:30Z — the UTC date agrees, so this is the control.
    expect(seasonLabelFor(new Date('2026-08-31T19:30:00Z'))).toBe('2025-26')
  })
  it('⚠️ 00:30 on 1 Sep DUBAI is the new season although the UTC date is 31 Aug', () => {
    // 20:30Z on 31 Aug. A UTC reading says 2025-26; the club says 2026-27.
    expect(seasonLabelFor(new Date('2026-08-31T20:30:00Z'))).toBe('2026-27')
  })
  it('pads the second year: 2099 → 2099-00', () => {
    expect(seasonLabelFor(new Date('2099-10-01T08:00:00Z'))).toBe('2099-00')
  })
})
