import { describe, it, expect } from 'vitest'
import { isLeaver, leaverName, isLeftOnly, formatLeftDate, LEFT_TAG } from '../src/lib/leavers.js'

describe('leavers helpers', () => {
  it('isLeaver is true only for a non-null left_at', () => {
    expect(isLeaver({ left_at: '2026-09-02T08:00:00Z' })).toBe(true)
    expect(isLeaver({ left_at: null })).toBe(false)
    expect(isLeaver({})).toBe(false)
    expect(isLeaver(null)).toBe(false)
  })

  it('leaverName tags a leaver and leaves a current player alone', () => {
    expect(leaverName({ full_name: 'Rafiq Delacroix-Obi', left_at: '2026-09-02T08:00:00Z' })).toBe(`Rafiq Delacroix-Obi · ${LEFT_TAG}`)
    expect(leaverName({ full_name: 'Tomasz Delacroix-Obi', left_at: null })).toBe('Tomasz Delacroix-Obi')
  })

  it('isLeftOnly: every row left → true; any active or pending → false; none → false', () => {
    expect(isLeftOnly([{ status: 'left' }, { status: 'left' }])).toBe(true)
    expect(isLeftOnly([{ status: 'left' }, { status: 'pending' }])).toBe(false)
    expect(isLeftOnly([{ status: 'left' }, { status: 'active' }])).toBe(false)
    expect(isLeftOnly([])).toBe(false)
    expect(isLeftOnly(null)).toBe(false)
  })
})

// ⚠️ ADDED 2 Sep 2026 by the leavers review. Two screens showed the same fact
// — the day a child left — in two different formats, because each formatted it
// itself: AdminClub had a fixed month table and PlayerDetail called
// toLocaleDateString. The formats DISAGREE in September, and only in
// September: Node's ICU renders en-GB's short month as "Sept", four letters,
// where every other month is three. So the club screen said "2 Sep 2026" and
// the player sheet said "2 Sept 2026" for the same player on the same day, and
// tests/player-form.test.jsx had a /sept?/ regex to accept either — which is a
// test written around a bug rather than at it.
describe('formatLeftDate', () => {
  it('renders a September date with the three-letter month, not ICU’s "Sept"', () => {
    expect(formatLeftDate('2026-09-02T08:00:00Z')).toBe('2 Sep 2026')
  })

  it('renders the other months too', () => {
    expect(formatLeftDate('2026-01-31T12:00:00Z')).toBe('31 Jan 2026')
    expect(formatLeftDate('2026-12-25T12:00:00Z')).toBe('25 Dec 2026')
  })

  // ⚠️ THE CONTROL FOR THE CLAIM ABOVE. If a future Node/ICU stops producing
  // "Sept", the comment explaining why this helper exists has gone stale and
  // somebody should be told rather than left guessing. It is deliberately an
  // assertion about the platform, not about our code.
  it('is not the same string the locale formatter would have produced', () => {
    const locale = new Date('2026-09-02T08:00:00Z').toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
    expect(locale).toBe('2 Sept 2026')
    expect(formatLeftDate('2026-09-02T08:00:00Z')).not.toBe(locale)
  })
})
