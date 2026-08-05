import { describe, it, expect, afterAll } from 'vitest'

// Unit tests for src/lib/recurrence.js — the pure date generator behind the
// event form's "Repeats" section. No React, no network, no mocks needed.
//
// PROCESS ZONE. This file runs under America/New_York, like
// tests/event-form.test.jsx and for the same reason. The generator claims to
// be zone-independent because it never constructs a Date; running it under a
// zone eight hours from Abu Dhabi is what turns that claim into a
// measurement. Under a UTC runner a Date-based implementation would pass by
// accident.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

import {
  MAX_SERIES_DAYS,
  SERIES_TOO_LONG,
  generateSeriesDates,
  nextDay,
  parseDateInput,
  weekdayOf,
} from '../src/lib/recurrence.js'

describe('weekdayOf', () => {
  // Anchors against days whose weekday is a matter of public record, not
  // against another computation in this repo — otherwise the test and the
  // code could be wrong together.
  it('names the right weekday, 0 = Sunday', () => {
    expect(weekdayOf({ year: 2026, month: 8, day: 5 })).toBe(3) // Wed 5 Aug 2026
    expect(weekdayOf({ year: 2026, month: 8, day: 1 })).toBe(6) // Sat 1 Aug 2026
    expect(weekdayOf({ year: 2026, month: 9, day: 1 })).toBe(2) // Tue 1 Sep 2026
    expect(weekdayOf({ year: 2000, month: 1, day: 1 })).toBe(6) // Sat 1 Jan 2000
    expect(weekdayOf({ year: 2028, month: 2, day: 29 })).toBe(2) // Tue 29 Feb 2028
  })
})

describe('nextDay', () => {
  it('rolls the month, the year and the leap day', () => {
    expect(nextDay({ year: 2026, month: 8, day: 30 })).toEqual({ year: 2026, month: 8, day: 31 })
    expect(nextDay({ year: 2026, month: 8, day: 31 })).toEqual({ year: 2026, month: 9, day: 1 })
    expect(nextDay({ year: 2026, month: 12, day: 31 })).toEqual({ year: 2027, month: 1, day: 1 })
    // 2028 is a leap year; 2026 is not. Same date, different answer.
    expect(nextDay({ year: 2028, month: 2, day: 28 })).toEqual({ year: 2028, month: 2, day: 29 })
    expect(nextDay({ year: 2026, month: 2, day: 28 })).toEqual({ year: 2026, month: 3, day: 1 })
    // 1900 is divisible by 4 but not a leap year; 2000 is.
    expect(nextDay({ year: 1900, month: 2, day: 28 })).toEqual({ year: 1900, month: 3, day: 1 })
    expect(nextDay({ year: 2000, month: 2, day: 28 })).toEqual({ year: 2000, month: 2, day: 29 })
  })
})

describe('parseDateInput', () => {
  it('accepts a real date input value and rejects anything else', () => {
    expect(parseDateInput('2026-08-11')).toEqual({ year: 2026, month: 8, day: 11 })
    expect(parseDateInput('')).toBeNull()
    expect(parseDateInput(null)).toBeNull()
    expect(parseDateInput('11/08/2026')).toBeNull()
    expect(parseDateInput('2026-13-01')).toBeNull()
    expect(parseDateInput('2026-09-31')).toBeNull() // September has 30 days
    expect(parseDateInput('2026-02-29')).toBeNull() // 2026 is not a leap year
    expect(parseDateInput('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 })
  })
})

describe('generateSeriesDates', () => {
  // THE case from the plan: two weekdays, across a month boundary. Tue and
  // Thu from 11 Aug 2026 to 10 Sep 2026 — 11 Aug is itself a Tuesday, and
  // the range crosses 31 Aug into September.
  it('generates two weekdays a week across a month boundary', () => {
    expect(generateSeriesDates('2026-08-11', [2, 4], '2026-09-10')).toEqual([
      '2026-08-11',
      '2026-08-13',
      '2026-08-18',
      '2026-08-20',
      '2026-08-25',
      '2026-08-27',
      '2026-09-01',
      '2026-09-03',
      '2026-09-08',
      '2026-09-10',
    ])
  })

  it('crosses a year boundary', () => {
    // Mondays from Mon 28 Dec 2026 to Mon 11 Jan 2027.
    expect(generateSeriesDates('2026-12-28', [1], '2027-01-11')).toEqual([
      '2026-12-28',
      '2027-01-04',
      '2027-01-11',
    ])
  })

  it('crosses a leap day, and lands ON it', () => {
    // Tuesdays from Tue 22 Feb 2028. 29 February 2028 is itself a Tuesday,
    // so it has to appear in the list. Anchored on the leap day being
    // GENERATED rather than merely walked past: a nextDay that skips 29 Feb
    // still produces the right March dates, because the weekday of a March
    // day is computed independently — so "the next Thursday is 2 March" is
    // not a measurement of leap handling at all. This is.
    expect(generateSeriesDates('2028-02-22', [2], '2028-03-07')).toEqual([
      '2028-02-22',
      '2028-02-29',
      '2028-03-07',
    ])
    // And the non-leap mirror: 2026 has no 29 February to land on.
    expect(generateSeriesDates('2026-02-24', [2], '2026-03-10')).toEqual([
      '2026-02-24',
      '2026-03-03',
      '2026-03-10',
    ])
  })

  it('does not include the start date when it is not one of the chosen days', () => {
    // Mon 10 Aug 2026, repeating Tue and Thu. Monday must not sneak in just
    // because it is where the coach happened to start.
    expect(generateSeriesDates('2026-08-10', [2, 4], '2026-08-20')).toEqual([
      '2026-08-11',
      '2026-08-13',
      '2026-08-18',
      '2026-08-20',
    ])
  })

  it('includes both ends of the range', () => {
    expect(generateSeriesDates('2026-08-11', [2], '2026-08-11')).toEqual(['2026-08-11'])
  })

  it('returns nothing rather than guessing, for input that names no series', () => {
    expect(generateSeriesDates('2026-08-11', [2, 4], '2026-08-01')).toEqual([]) // end before start
    expect(generateSeriesDates('2026-08-11', [], '2026-09-10')).toEqual([]) // no weekdays
    expect(generateSeriesDates('2026-08-11', undefined, '2026-09-10')).toEqual([])
    expect(generateSeriesDates('', [2], '2026-09-10')).toEqual([]) // no start
    expect(generateSeriesDates('2026-08-11', [2], '')).toEqual([]) // no end
    expect(generateSeriesDates('2026-08-11', [9], '2026-09-10')).toEqual([]) // not a weekday
  })

  it('ignores duplicate and out-of-order weekdays', () => {
    expect(generateSeriesDates('2026-08-11', [4, 2, 2, 4], '2026-08-20')).toEqual(
      generateSeriesDates('2026-08-11', [2, 4], '2026-08-20'),
    )
  })

  it('throws on a range over a year instead of silently truncating', () => {
    // A mistyped "2036" for "2026" must not look like a successful save.
    expect(() => generateSeriesDates('2026-08-11', [2], '2036-08-11')).toThrow(SERIES_TOO_LONG)
    // Exactly at the limit is still fine: 366 days scanned, inclusive.
    expect(() => generateSeriesDates('2026-08-11', [2], '2027-08-11')).not.toThrow()
    expect(MAX_SERIES_DAYS).toBe(366)
  })

  it('gives the same answer whatever zone the browser is in', () => {
    // The generator constructs no Date, so it cannot read the ambient zone.
    // Anchored on the LITERAL expected dates, not on comparing one call to
    // another — a self-comparison is true even for an implementation that is
    // uniformly wrong, so it would measure nothing.
    const expected = ['2026-08-11', '2026-08-13', '2026-08-18', '2026-08-20']
    for (const zone of ['UTC', 'America/New_York', 'Asia/Dubai', 'Pacific/Kiritimati']) {
      process.env.TZ = zone
      expect(generateSeriesDates('2026-08-11', [2, 4], '2026-08-20')).toEqual(expected)
    }
    process.env.TZ = 'America/New_York'
  })
})
