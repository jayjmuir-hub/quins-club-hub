// Repeating events: turning "every Tuesday and Thursday until 12 December"
// into the actual list of club days.
//
// Pure, no imports, no React, no network — same rule as src/lib/scope.js and
// src/lib/eventFormat.js, so it is testable with plain numbers and strings.
//
// ⚠️ EVERYTHING HERE IS INTEGER ARITHMETIC ON {year, month, day}. Not one
// Date object is constructed, and that is deliberate, for exactly the reason
// the calendar grid is built the same way (see CLUB_TIME_ZONE in
// src/lib/eventFormat.js): a Date re-reads the browser's zone. A coach in
// London adding "every Tuesday" would otherwise get a set of dates computed
// against London's calendar, and any occurrence whose Abu Dhabi day differs
// from London's lands on the wrong weekday. Weekday, leap years and month
// lengths are all computed here from the numbers alone, so the answer is the
// same in every zone on earth.
//
// The dates this produces are CLUB days, as 'yyyy-mm-dd' strings. Turning
// each one into a UTC instant is still clubWallTimeToUtc's job — this module
// never touches times.

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/

// A series is bounded at one year. Four months is the real use case; the
// limit exists so a mistyped end date ("2036" for "2026") cannot turn one
// form submission into 500 rows. It THROWS rather than quietly generating
// the first 366 days — a silent cap would look like a successful save and
// leave half a decade of phantom training sessions unaccounted for.
export const MAX_SERIES_DAYS = 366

export const SERIES_TOO_LONG =
  'A repeating series can run for at most a year. Choose an earlier end date.'

// Sakamoto's algorithm. Gregorian day-of-week from year/month/day with
// nothing but integer arithmetic — no Date, no locale, no zone.
// Returns 0 = Sunday … 6 = Saturday, matching Date.prototype.getDay()'s
// numbering so callers reading either source agree.
const SAKAMOTO_OFFSETS = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]

export function weekdayOf({ year, month, day }) {
  // The algorithm treats January and February as months 13 and 14 of the
  // previous year, which is what makes the leap day fall in the right place.
  const y = month < 3 ? year - 1 : year
  return (
    (y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) +
      SAKAMOTO_OFFSETS[month - 1] +
      day) %
    7
  )
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

/**
 * The next calendar day, rolling the month and then the year. Pure numbers,
 * so a series crossing 31 Aug -> 1 Sep, 31 Dec -> 1 Jan, or 28 Feb -> 29 Feb
 * in a leap year is handled by the same three lines rather than by Date.
 */
export function nextDay({ year, month, day }) {
  if (day < daysInMonth(year, month)) return { year, month, day: day + 1 }
  if (month < 12) return { year, month: month + 1, day: 1 }
  return { year: year + 1, month: 1, day: 1 }
}

/**
 * Parses a `<input type="date">` value ('2026-08-11') into {year, month, day}
 * with a 1-based month, or null when it isn't in that exact format or names a
 * day that doesn't exist (31 Sep, 30 Feb). Callers treat null as a validation
 * failure.
 */
export function parseDateInput(value) {
  const match = DATE_INPUT.exec(String(value ?? ''))
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

/**
 * Formats {year, month, day} back to a 'yyyy-mm-dd' string.
 */
export function formatDateInput({ year, month, day }) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

// Ordering is a plain field-by-field comparison. For a fixed-width
// 'yyyy-mm-dd' that is the same as chronological order, which is why the
// formatted strings are safe to compare directly too.
function compare(a, b) {
  if (a.year !== b.year) return a.year - b.year
  if (a.month !== b.month) return a.month - b.month
  return a.day - b.day
}

/**
 * Every club day between `startValue` and `endValue` inclusive that falls on
 * one of `weekdays`.
 *
 * @param {string} startValue  'yyyy-mm-dd', the first event's date. Included
 *                             only if its own weekday is in the set — a coach
 *                             who opens the form on a Monday and ticks Tue+Thu
 *                             means Tue and Thu, not Monday as well.
 * @param {number[]} weekdays  0 = Sunday … 6 = Saturday. Order and duplicates
 *                             don't matter.
 * @param {string} endValue    'yyyy-mm-dd', inclusive.
 * @returns {string[]}         'yyyy-mm-dd' strings, ascending. Empty when
 *                             nothing matches, when either date is
 *                             unparseable, when no weekday is selected, or
 *                             when the end is before the start.
 * @throws {Error}             SERIES_TOO_LONG when the range exceeds
 *                             MAX_SERIES_DAYS.
 */
export function generateSeriesDates(startValue, weekdays, endValue) {
  const start = parseDateInput(startValue)
  const end = parseDateInput(endValue)
  if (!start || !end) return []
  if (compare(start, end) > 0) return []

  const wanted = new Set((weekdays ?? []).map(Number).filter((n) => n >= 0 && n <= 6))
  if (wanted.size === 0) return []

  const dates = []
  let cursor = start
  let scanned = 0

  // Walk day by day rather than jumping in 7s. It is at most 366 iterations
  // of integer addition, and it makes the multi-weekday case fall out for
  // free instead of needing one stride per selected weekday, merged.
  while (compare(cursor, end) <= 0) {
    if (++scanned > MAX_SERIES_DAYS) throw new Error(SERIES_TOO_LONG)
    if (wanted.has(weekdayOf(cursor))) dates.push(formatDateInput(cursor))
    cursor = nextDay(cursor)
  }

  return dates
}

// Monday-first, because that is how a season is read — the checkbox row in
// the form renders straight from this. `value` is the getDay() number.
export const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]
