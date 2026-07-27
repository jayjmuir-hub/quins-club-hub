import { describe, it, expect } from 'vitest'
import {
  dateBoxParts,
  eventDate,
  eventTitle,
  formatLongDate,
  formatTime,
  hasResult,
  resultLabel,
  resultOutcome,
  resultScore,
  sortByStart,
} from '../src/lib/eventFormat.js'

// Direct tests for src/lib/eventFormat.js — pure, import-free helpers, so
// this follows the same shape as tests/scope.test.js: plain fixture objects,
// no rendering, no mocks, no network.
//
// Locale caution: these helpers deliberately format with the runtime's
// default locale (`undefined`), so asserting "5:00 PM" or "Jul" would bind
// the suite to whichever ICU locale the machine happens to resolve. The
// fallback strings are locale-independent and asserted exactly; the
// formatted paths are asserted on the parts that hold in any locale (the
// day-of-month, which is String(getDate()) and not localised at all, plus
// "did it produce something other than the fallback"). Dates are built from
// local components (new Date(y, m, d, h, min)) rather than ISO strings, so
// no assertion depends on the machine's timezone either.

const scored = (us, them) => ({ id: 'e', type: 'match', opponent: 'Exiles', result_us: us, result_them: them })

describe('hasResult', () => {
  it('is true when both halves of the score are present', () => {
    expect(hasResult(scored(31, 19))).toBe(true)
  })

  it('is true for a nil-all draw', () => {
    // 0 is a real score. A truthiness check here would misfile a 0–0 draw
    // as an unplayed fixture.
    expect(hasResult(scored(0, 0))).toBe(true)
  })

  it('is false when neither half is present', () => {
    expect(hasResult(scored(null, null))).toBe(false)
  })

  it('is false when only our score has been entered', () => {
    // The case that matters: a coach who saves a half-entered score must not
    // knock the fixture out of Upcoming. An || here instead of && would.
    expect(hasResult(scored(31, null))).toBe(false)
  })

  it('is false when only the opposition score has been entered', () => {
    expect(hasResult(scored(null, 19))).toBe(false)
  })

  it('is false for a missing event', () => {
    expect(hasResult(undefined)).toBe(false)
    expect(hasResult(null)).toBe(false)
  })
})

describe('resultOutcome / resultLabel / resultScore', () => {
  it('reads a higher Quins score as a win', () => {
    expect(resultOutcome(scored(31, 19))).toBe('win')
    expect(resultLabel(scored(31, 19))).toBe('Won')
  })

  it('reads a lower Quins score as a loss', () => {
    expect(resultOutcome(scored(12, 40))).toBe('loss')
    expect(resultLabel(scored(12, 40))).toBe('Lost')
  })

  it('reads equal scores as a draw', () => {
    expect(resultOutcome(scored(17, 17))).toBe('draw')
    expect(resultLabel(scored(17, 17))).toBe('Drew')
  })

  it('has no outcome, label or score without a full score', () => {
    expect(resultOutcome(scored(31, null))).toBeNull()
    expect(resultLabel(scored(31, null))).toBeNull()
    expect(resultScore(scored(31, null))).toBeNull()
  })

  it('formats the score with an en dash, matching the prototype', () => {
    expect(resultScore(scored(31, 19))).toBe('31–19')
  })
})

describe('eventTitle', () => {
  it('renders a match as "Quins vs <opponent>"', () => {
    expect(eventTitle({ type: 'match', opponent: 'Dubai Exiles' })).toBe('Quins vs Dubai Exiles')
  })

  it('uses the stored title for training and social events', () => {
    expect(eventTitle({ type: 'training', title: 'Senior squad training' })).toBe('Senior squad training')
    expect(eventTitle({ type: 'social', title: 'End of season dinner' })).toBe('End of season dinner')
  })

  it('prefers the title over "Quins vs" only when there is no opponent', () => {
    expect(eventTitle({ type: 'match', opponent: null, title: 'Friendly' })).toBe('Friendly')
  })

  it('falls back to "Quins match" for a match with neither opponent nor title', () => {
    expect(eventTitle({ type: 'match', opponent: null, title: null })).toBe('Quins match')
  })

  it('falls back to "Club event" for anything else with no title', () => {
    expect(eventTitle({ type: 'training', title: null })).toBe('Club event')
    expect(eventTitle(undefined)).toBe('Club event')
  })
})

describe('eventDate', () => {
  it('parses a timestamp into a Date', () => {
    const date = eventDate({ starts_at: '2026-07-24T13:00:00+00:00' })
    expect(date).toBeInstanceOf(Date)
    expect(date.getTime()).toBe(Date.parse('2026-07-24T13:00:00+00:00'))
  })

  it('is null when there is no timestamp', () => {
    expect(eventDate({})).toBeNull()
    expect(eventDate(undefined)).toBeNull()
  })

  it('is null for an unparseable timestamp rather than an Invalid Date', () => {
    expect(eventDate({ starts_at: 'not a date' })).toBeNull()
  })
})

describe('dateBoxParts', () => {
  it('splits a date into month, day and weekday', () => {
    const parts = dateBoxParts(new Date(2026, 6, 24, 17, 0))
    expect(parts.day).toBe('24')
    expect(parts.month).not.toBe('—')
    expect(parts.weekday).not.toBe('')
  })

  it('renders placeholders instead of "Invalid Date" for a null date', () => {
    expect(dateBoxParts(null)).toEqual({ month: '—', day: '–', weekday: '' })
  })
})

describe('formatTime / formatLongDate', () => {
  it('formats a real date without leaking "Invalid Date"', () => {
    const date = new Date(2026, 6, 24, 17, 0)
    expect(formatTime(date)).toContain('00')
    expect(formatTime(date)).not.toMatch(/invalid/i)
    expect(formatLongDate(date)).toContain('2026')
    expect(formatLongDate(date)).toContain('24')
  })

  it('falls back to plain copy for a null date', () => {
    expect(formatTime(null)).toBe('Time to be confirmed')
    expect(formatLongDate(null)).toBe('Date to be confirmed')
  })
})

describe('sortByStart', () => {
  const a = { id: 'a', starts_at: '2026-07-01T10:00:00Z' }
  const b = { id: 'b', starts_at: '2026-07-15T10:00:00Z' }
  const c = { id: 'c', starts_at: '2026-08-01T10:00:00Z' }
  const undated = { id: 'undated', starts_at: null }

  it('sorts ascending by default', () => {
    expect(sortByStart([c, a, b]).map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts descending on request, for newest-first results', () => {
    expect(sortByStart([a, c, b], 'desc').map((e) => e.id)).toEqual(['c', 'b', 'a'])
  })

  it('puts an undated event last in both directions', () => {
    // A row with no usable date must never displace real fixtures from the
    // top of either list — and a NaN comparison would sort unpredictably.
    expect(sortByStart([undated, b, a]).map((e) => e.id)).toEqual(['a', 'b', 'undated'])
    expect(sortByStart([undated, a, b], 'desc').map((e) => e.id)).toEqual(['b', 'a', 'undated'])
  })

  it('keeps two undated events together rather than throwing', () => {
    const other = { id: 'other', starts_at: null }
    expect(sortByStart([undated, other]).map((e) => e.id)).toEqual(['undated', 'other'])
  })

  it('does not mutate the array it was given', () => {
    const input = [c, a, b]
    sortByStart(input)
    expect(input.map((e) => e.id)).toEqual(['c', 'a', 'b'])
  })
})
