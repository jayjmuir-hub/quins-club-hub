import { describe, it, expect } from 'vitest'
import {
  CLUB_TIME_ZONE,
  clubDayParts,
  clubToday,
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
  // Fixtures here are anchored with Date.UTC, never the local
  // `new Date(y, m, d, h, m)` constructor. That constructor builds a
  // DIFFERENT INSTANT in every process zone, while these assertions read it
  // back through formatters pinned to Asia/Dubai — so `new Date(2026, 6,
  // 24, 17, 0)` asserted as day "24" passes in UTC and fails under
  // TZ=America/New_York (17:00 New York = 01:00 on the 25th in Dubai). It
  // was zone-proof before the formatters were club-anchored, because
  // construction and read-back moved together; it is not any more. In a
  // file whose whole purpose is zone-independence, the fixture has to be an
  // unambiguous instant.
  //
  // 21:00 UTC on the 23rd is 01:00 on the 24th in Dubai, so this stays a
  // real assertion rather than a same-day tautology: anything reading the
  // browser's own day answers 23 here under both UTC and New York.
  it('splits a date into month, day and weekday', () => {
    const parts = dateBoxParts(new Date(Date.UTC(2026, 6, 23, 21, 0)))
    expect(parts.day).toBe('24')
    expect(parts.month).not.toBe('—')
    expect(parts.weekday).not.toBe('')
  })

  it('renders placeholders instead of "Invalid Date" for a null date', () => {
    expect(dateBoxParts(null)).toEqual({ month: '—', day: '–', weekday: '' })
  })
})

describe('formatTime / formatLongDate', () => {
  // Same UTC-anchored instant, and for the same reason as in dateBoxParts
  // above: 21:00 UTC on the 23rd = 01:00 on Fri 24 Jul 2026 in Dubai, which
  // is the day and year asserted below.
  it('formats a real date without leaking "Invalid Date"', () => {
    const date = new Date(Date.UTC(2026, 6, 23, 21, 0))
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

// --- Club timezone -------------------------------------------------------
//
// Jay's ruling: every event time renders in Abu Dhabi time, whoever is
// reading. "20:00" must mean 20:00 at Zayed Sports City for a parent in
// London as much as for one in Abu Dhabi.
//
// The trap in testing this is that the defect is invisible on a machine
// whose clock agrees with the assertion. This runner defaults to UTC, and
// UTC and Dubai share a calendar day for 20 hours out of every 24 — so a
// test using a mid-afternoon instant would pass just as happily against a
// completely unfixed formatter. Every instant below is therefore chosen so
// that Dubai's answer differs from at least one of UTC, New York and
// Auckland, and the whole set is run under all three process zones.

const HOSTILE_ZONES = ['UTC', 'America/New_York', 'Pacific/Auckland']

function withTimeZone(zone, fn) {
  const previous = process.env.TZ
  process.env.TZ = zone
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
}

// 21:00 UTC on 24 Jul = 01:00 on the 25th in Dubai (UTC+4).
//   UTC       -> 24th 21:00
//   New York  -> 24th 17:00
//   Auckland  -> 25th 09:00   (agrees with Dubai on the day, not the time)
const NEXT_DAY_IN_DUBAI = new Date('2026-07-24T21:00:00Z')

// 13:00 UTC on 24 Jul = 17:00 on the 24th in Dubai.
//   UTC/New York -> 24th
//   Auckland     -> 25th      (disagrees with Dubai on the day)
const SAME_DAY_IN_DUBAI = new Date('2026-07-24T13:00:00Z')

// 20:00 UTC = exactly 00:00 on the 25th in Dubai — the midnight boundary.
const MIDNIGHT_IN_DUBAI = new Date('2026-07-24T20:00:00Z')

// 19:59 UTC on 31 Jul = 23:59 on the 31st in Dubai: last minute of the month.
const LAST_MINUTE_OF_JULY = new Date('2026-07-31T19:59:00Z')

// 21:00 UTC on 31 Jul = 01:00 on 1 Aug in Dubai: first minute of the next
// month, and the case that puts a fixture in the wrong calendar cell.
const FIRST_HOUR_OF_AUGUST = new Date('2026-07-31T21:00:00Z')

describe('club timezone', () => {
  it('is the IANA zone identifier, not a fixed offset', () => {
    // An offset would be a derived fact that silently rots if the UAE ever
    // adopts DST; the zone identifier is the durable abstraction.
    expect(CLUB_TIME_ZONE).toBe('Asia/Dubai')
  })

  // Guard the guard. If Node ever stopped honouring a runtime TZ change,
  // every zone assertion below would pass vacuously and prove nothing.
  it('the withTimeZone helper really does change the process zone', () => {
    expect(withTimeZone('America/New_York', () => NEXT_DAY_IN_DUBAI.getDate())).toBe(24)
    expect(withTimeZone('Pacific/Auckland', () => NEXT_DAY_IN_DUBAI.getDate())).toBe(25)
    expect(withTimeZone('UTC', () => NEXT_DAY_IN_DUBAI.getHours())).toBe(21)
  })
})

describe('clubDayParts', () => {
  it('reports the Dubai calendar day, not the process one', () => {
    HOSTILE_ZONES.forEach((zone) => {
      withTimeZone(zone, () => {
        // 01:00 on the 25th in Dubai.
        expect(clubDayParts(NEXT_DAY_IN_DUBAI)).toEqual({ year: 2026, month: 6, day: 25 })
        // 17:00 on the 24th in Dubai — Auckland would say the 25th.
        expect(clubDayParts(SAME_DAY_IN_DUBAI)).toEqual({ year: 2026, month: 6, day: 24 })
      })
    })
  })

  it('handles the midnight boundary', () => {
    HOSTILE_ZONES.forEach((zone) => {
      withTimeZone(zone, () => {
        expect(clubDayParts(MIDNIGHT_IN_DUBAI)).toEqual({ year: 2026, month: 6, day: 25 })
      })
    })
  })

  it('handles a month boundary in both directions', () => {
    HOSTILE_ZONES.forEach((zone) => {
      withTimeZone(zone, () => {
        expect(clubDayParts(LAST_MINUTE_OF_JULY)).toEqual({ year: 2026, month: 6, day: 31 })
        // The one that would land a fixture in the wrong month's grid.
        expect(clubDayParts(FIRST_HOUR_OF_AUGUST)).toEqual({ year: 2026, month: 7, day: 1 })
      })
    })
  })

  it('rolls the year over at the club new year', () => {
    // 20:00 UTC on 31 Dec 2026 = 00:00 on 1 Jan 2027 in Dubai.
    HOSTILE_ZONES.forEach((zone) => {
      withTimeZone(zone, () => {
        expect(clubDayParts(new Date('2026-12-31T20:00:00Z'))).toEqual({ year: 2027, month: 0, day: 1 })
      })
    })
  })
})

describe('clubToday', () => {
  it('returns the club-local date for right now, whatever the process zone', () => {
    const reference = (zone) =>
      withTimeZone(zone, () => {
        const now = new Date()
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Dubai',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        }).formatToParts(now)
        const get = (type) => Number(parts.find((part) => part.type === type).value)
        return { today: clubToday(), expected: { year: get('year'), month: get('month') - 1, day: get('day') } }
      })

    HOSTILE_ZONES.forEach((zone) => {
      const { today, expected } = reference(zone)
      expect(today).toEqual(expected)
    })
  })
})

describe('dateBoxParts in club time', () => {
  it('shows the Dubai day for a fixture that falls on the next Dubai day', () => {
    HOSTILE_ZONES.forEach((zone) => {
      withTimeZone(zone, () => {
        expect(dateBoxParts(NEXT_DAY_IN_DUBAI).day).toBe('25')
        expect(dateBoxParts(SAME_DAY_IN_DUBAI).day).toBe('24')
        expect(dateBoxParts(MIDNIGHT_IN_DUBAI).day).toBe('25')
        expect(dateBoxParts(FIRST_HOUR_OF_AUGUST).day).toBe('1')
      })
    })
  })

  it('renders byte-identically under every process zone', () => {
    // Exact-output pinning that does not depend on the runner's locale:
    // whatever the strings are, they must not vary with the process zone.
    ;[NEXT_DAY_IN_DUBAI, SAME_DAY_IN_DUBAI, MIDNIGHT_IN_DUBAI, FIRST_HOUR_OF_AUGUST].forEach((instant) => {
      const rendered = HOSTILE_ZONES.map((zone) => withTimeZone(zone, () => JSON.stringify(dateBoxParts(instant))))
      expect(new Set(rendered).size).toBe(1)
    })
  })

  it('reports the month and weekday of the Dubai day, not the process day', () => {
    HOSTILE_ZONES.forEach((zone) => {
      withTimeZone(zone, () => {
        // 1 Aug 2026 in Dubai is a Saturday; 31 Jul is a Friday. A formatter
        // reading the process zone would say Friday/July here under UTC.
        const parts = dateBoxParts(FIRST_HOUR_OF_AUGUST)
        expect(parts.month).toBe(
          new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short' }).format(Date.UTC(2026, 7, 1)),
        )
        expect(parts.weekday).toBe(
          new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short' }).format(Date.UTC(2026, 7, 1)),
        )
      })
    })
  })
})

describe('formatTime / formatLongDate in club time', () => {
  it('renders the Dubai wall-clock time under every process zone', () => {
    const rendered = HOSTILE_ZONES.map((zone) => withTimeZone(zone, () => formatTime(NEXT_DAY_IN_DUBAI)))
    expect(new Set(rendered).size).toBe(1)
    // 01:00 in Dubai — "1:00" in 12-hour locales, "01:00" in 24-hour ones.
    expect(rendered[0]).toMatch(/\b0?1:00\b/)
    // and specifically NOT the 21:00/9:00 the raw UTC instant would give.
    expect(rendered[0]).not.toMatch(/\b(21:00|9:00)\b/)
  })

  it('renders midnight in Dubai, not the previous evening elsewhere', () => {
    const rendered = HOSTILE_ZONES.map((zone) => withTimeZone(zone, () => formatTime(MIDNIGHT_IN_DUBAI)))
    expect(new Set(rendered).size).toBe(1)
    expect(rendered[0]).toMatch(/\b(12:00|00:00|0:00)\b/)
  })

  it('renders the Dubai calendar date in the long form under every process zone', () => {
    const rendered = HOSTILE_ZONES.map((zone) => withTimeZone(zone, () => formatLongDate(NEXT_DAY_IN_DUBAI)))
    expect(new Set(rendered).size).toBe(1)
    expect(rendered[0]).toContain('25')
    expect(rendered[0]).toContain('2026')
  })

  it('carries the long date into the next month at a month boundary', () => {
    const rendered = HOSTILE_ZONES.map((zone) => withTimeZone(zone, () => formatLongDate(FIRST_HOUR_OF_AUGUST)))
    expect(new Set(rendered).size).toBe(1)
    const august = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short' }).format(Date.UTC(2026, 7, 1))
    expect(rendered[0]).toContain(august)
  })

  it('keeps its null fallbacks', () => {
    expect(formatTime(null)).toBe('Time to be confirmed')
    expect(formatLongDate(null)).toBe('Date to be confirmed')
    expect(dateBoxParts(null)).toEqual({ month: '—', day: '–', weekday: '' })
  })
})
