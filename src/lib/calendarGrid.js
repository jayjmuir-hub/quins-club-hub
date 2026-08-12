// Date arithmetic for the pitch calendar. Pure, no imports, no React.
//
// ⚠️ EVERY DATE HERE IS THE CLUB'S, NOT THE READER'S. The whole app treats Abu
// Dhabi as the calendar (CLUB_TIME_ZONE in src/lib/eventFormat.js), and a grid
// built from the browser's midnight puts a 6pm Saturday training in the wrong
// cell for anyone outside the UAE — including, on tour, the person who wrote
// it. Days are carried as plain { year, month, day } parts and only turned into
// an instant at the edges, which is the same shape clubToday() already returns.
//
// ⚠️ THE OFFSET IS FIXED AT +04:00, AND THAT IS CORRECT RATHER THAN LAZY. The
// UAE has not observed daylight saving since 1990 and has no plans to; Asia/Dubai
// is a constant +04:00. src/screens/Allocation.jsx's dayWindow already relies on
// this. If that ever changes, this is one of two places to fix.

const MS_HOUR = 60 * 60 * 1000
const MS_DAY = 24 * MS_HOUR
const CLUB_OFFSET_MS = 4 * MS_HOUR

/** Club midnight for a { year, month, day }, as a real instant. */
export function clubMidnight({ year, month, day }) {
  return new Date(Date.UTC(year, month, day, 0, 0, 0) - CLUB_OFFSET_MS)
}

/** The { year, month, day } `delta` days from this one. */
export function shiftDay({ year, month, day }, delta) {
  const moved = new Date(Date.UTC(year, month, day + delta))
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth(), day: moved.getUTCDate() }
}

/** The { year, month, day } `delta` months from this one, clamped into range. */
export function shiftMonth({ year, month, day }, delta) {
  // ⚠️ CLAMPED, NOT ROLLED OVER. `new Date(2026, 1, 31)` is 3 March, so paging
  // from 31 January would land in March and skip February entirely — the kind
  // of bug that only shows up on five days of the year.
  const target = new Date(Date.UTC(year, month + delta, 1))
  const y = target.getUTCFullYear()
  const m = target.getUTCMonth()
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return { year: y, month: m, day: Math.min(day, lastDay) }
}

/**
 * Monday-to-Sunday, which is the right week for THIS club rather than a default.
 *
 * ⚠️ THE UAE WEEKEND IS SATURDAY AND SUNDAY, and rugby is played on it. A
 * Sunday-start week would split the weekend across two screens — the two days
 * that actually matter to Pitch Management would never be side by side. Monday
 * start puts them together at the end, which is also how a season reads.
 */
export function startOfWeek(parts) {
  const at = new Date(Date.UTC(parts.year, parts.month, parts.day))
  // getUTCDay(): 0 = Sunday. Monday-start means Sunday is 6 days in, not 0.
  const backwards = (at.getUTCDay() + 6) % 7
  return shiftDay(parts, -backwards)
}

/** The seven days of the week containing `parts`. */
export function weekDays(parts) {
  const first = startOfWeek(parts)
  return Array.from({ length: 7 }, (unused, i) => shiftDay(first, i))
}

/**
 * The month grid containing `parts`: whole weeks, Monday-start, padded.
 *
 * ⚠️ PADDED WITH REAL NEIGHBOURING DAYS, NOT BLANKS. A fixture on 1 March that
 * falls in the last row of February's grid must still be visible there — a
 * blank pad would hide a booking on a screen whose entire job is showing what
 * is booked. Each entry carries `inMonth` so the padding can be drawn quieter
 * without being dropped.
 *
 * ⚠️ ALWAYS WHOLE WEEKS, so the grid never has a ragged final row and the
 * column headings keep meaning what they say.
 */
export function monthGrid(parts) {
  const first = { year: parts.year, month: parts.month, day: 1 }
  const gridStart = startOfWeek(first)
  const lastDay = new Date(Date.UTC(parts.year, parts.month + 1, 0)).getUTCDate()
  const last = { year: parts.year, month: parts.month, day: lastDay }
  const gridEnd = shiftDay(startOfWeek(last), 6)

  const days = []
  for (let cursor = gridStart; ; cursor = shiftDay(cursor, 1)) {
    days.push({ ...cursor, inMonth: cursor.month === parts.month && cursor.year === parts.year })
    if (cursor.year === gridEnd.year && cursor.month === gridEnd.month && cursor.day === gridEnd.day) {
      break
    }
  }
  return days
}

/**
 * A from/to window covering every day in `days`, midnight to midnight, club time.
 *
 * Returned as ISO strings because that is what listEvents({ from, to }) takes.
 */
export function windowFor(days) {
  if (!days || days.length === 0) return null
  const start = clubMidnight(days[0])
  const end = new Date(clubMidnight(days[days.length - 1]).getTime() + MS_DAY - 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

/** `true` when two { year, month, day } refer to the same date. */
export function sameDay(a, b) {
  return Boolean(a && b && a.year === b.year && a.month === b.month && a.day === b.day)
}

/**
 * Groups events into a Map keyed by `${year}-${month}-${day}` in CLUB time.
 *
 * ⚠️ KEYED OFF THE CLUB'S CALENDAR DAY, NOT `starts_at`'s UTC DATE. A 9pm
 * Abu Dhabi kick-off is 17:00 UTC the same day, but an 01:00 one is 21:00 UTC
 * the day BEFORE — so slicing on the UTC date would file some fixtures under
 * yesterday. Late kick-offs are rare and that is exactly why this would be
 * found in November rather than in testing.
 */
export function dayKeyOf(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type) => Number(parts.find((part) => part.type === type).value)
  // month - 1 so the key matches the 0-based `month` these helpers carry.
  return `${get('year')}-${get('month') - 1}-${get('day')}`
}

/** The key for a { year, month, day }. Matches dayKeyOf's shape. */
export function dayKey({ year, month, day }) {
  return `${year}-${month}-${day}`
}
