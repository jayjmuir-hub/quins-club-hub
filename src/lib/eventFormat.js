// Pure presentation helpers for events. No imports — same rule as
// src/lib/scope.js: trivially testable with plain fixture objects, no
// network, no React, no global state.
//
// These live here rather than inside Schedule.jsx because both Schedule and
// EventDetail need them right now (Schedule imports EventDetail, so putting
// them in either screen would mean an import cycle or a wrong-way
// dependency), and Task 13's dashboard needs the same "next fixture" /
// "last result" vocabulary.

const OUTCOME = { win: 'Won', loss: 'Lost', draw: 'Drew' }

/**
 * Every event time in this app renders in Abu Dhabi time, whoever is
 * reading it. The club has one home ground, so "20:00" has to mean 20:00 at
 * Zayed Sports City for a parent checking fixtures from London as much as
 * for one standing on the touchline — otherwise that parent reads a 20:00
 * kick-off as 16:00 and turns up four hours late.
 *
 * This is an IANA zone identifier, deliberately not a fixed '+04:00'
 * offset. The UAE has no DST today, so the two currently agree — but an
 * offset is a derived fact that would silently rot if that ever changed,
 * whereas the zone identifier stays correct by definition. Everything here
 * goes through Intl's `timeZone` option rather than any local-Date getter.
 *
 * This is a PRESENTATION concern only. starts_at is timestamptz and stays
 * UTC in the database; upcoming-vs-past is an instant comparison and is
 * already zone-agnostic (see sortByStart / hasResult — neither is touched
 * by any of this).
 */
export const CLUB_TIME_ZONE = 'Asia/Dubai'

// Locale is pinned to en-US here on purpose, and only here: this formatter
// exists to extract *numbers*, never to produce user-visible text, and a
// locale like ja-JP would return "24日" for a numeric day. The user-facing
// formatters below still use the reader's own locale.
//
// Built once at module load and reused. That is safe despite the tests
// changing process.env.TZ underneath it, because the timeZone is bound
// explicitly to CLUB_TIME_ZONE — this formatter never consults the ambient
// zone, which is the entire point.
const CLUB_PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: CLUB_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

/**
 * The calendar year/month/day an instant falls on **in club time**, as
 * plain numbers (month is 0-based, matching Date's convention).
 *
 * This is what day-bucketing and "is this today" must be built on. A 01:00
 * Dubai kick-off is 21:00 the previous day in UTC and 22:00 the previous
 * evening in London, so reading date.getDate() would file it under the
 * wrong day — a wrong, visible calendar cell for whoever is reading.
 */
export function clubDayParts(date) {
  const parts = CLUB_PARTS_FORMAT.formatToParts(date)
  const value = (type) => Number(parts.find((part) => part.type === type).value)
  return { year: value('year'), month: value('month') - 1, day: value('day') }
}

/**
 * Today's date in club time. Used for the calendar's "today" ring and for
 * which month it opens on — both of which must follow Abu Dhabi's day, not
 * the reader's.
 */
export function clubToday() {
  return clubDayParts(new Date())
}

/**
 * True when a fixture has a score recorded.
 *
 * This — not an elapsed date — is what makes an event a "result", matching
 * the prototype (design-system.md §7: "'past' vs 'upcoming' is determined
 * by event.result being non-null, not by comparing when to the current
 * date"). A match played last week whose score nobody has entered yet is
 * still Upcoming, which is the point: it stays visible until someone
 * records the score. Both halves must be present — a half-entered score is
 * not a result.
 */
export function hasResult(event) {
  return event?.result_us != null && event?.result_them != null
}

/**
 * 'win' | 'loss' | 'draw' for a scored fixture, null when there's no score.
 * result_us is always the Quins score, so the comparison needs no is-home
 * adjustment.
 */
export function resultOutcome(event) {
  if (!hasResult(event)) return null
  if (event.result_us > event.result_them) return 'win'
  if (event.result_us < event.result_them) return 'loss'
  return 'draw'
}

/**
 * Human label for an outcome ('Won'/'Lost'/'Drew'), or null.
 */
export function resultLabel(event) {
  const outcome = resultOutcome(event)
  return outcome ? OUTCOME[outcome] : null
}

/**
 * The score as displayed, e.g. "31–19" (en dash, matching the prototype's
 * .score), or null when there's no score.
 */
export function resultScore(event) {
  if (!hasResult(event)) return null
  return `${event.result_us}–${event.result_them}`
}

/**
 * The line a fixture row shows as its title. Matches render "Quins vs
 * <opponent>"; training/social events show their own title. The schema
 * allows both to be missing (title is nullable, opponent is match-only), so
 * there is a last-resort fallback rather than a blank row.
 */
export function eventTitle(event) {
  if (event?.type === 'match' && event.opponent) return `Quins vs ${event.opponent}`
  if (event?.title) return event.title
  if (event?.type === 'match') return 'Quins match'
  return 'Club event'
}

/**
 * Parses a timestamptz string into a Date, or null if it's missing or
 * unparseable — callers render a dash rather than "Invalid Date".
 */
export function eventDate(event) {
  if (!event?.starts_at) return null
  const date = new Date(event.starts_at)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * The three lines of the fixture row's date box (design-system.md §4.13):
 * short month, day of month, short weekday.
 */
export function dateBoxParts(date) {
  if (!date) return { month: '—', day: '–', weekday: '' }
  return {
    month: date.toLocaleDateString(undefined, { timeZone: CLUB_TIME_ZONE, month: 'short' }),
    // Read off clubDayParts rather than a `day: 'numeric'` format, which in
    // some locales appends a unit ("24日") — the date box wants a bare
    // number.
    day: String(clubDayParts(date).day),
    weekday: date.toLocaleDateString(undefined, { timeZone: CLUB_TIME_ZONE, weekday: 'short' }),
  }
}

/**
 * "7:30 PM" — the time shown on fixture rows and in the detail sheet,
 * always the Abu Dhabi wall-clock time (see CLUB_TIME_ZONE).
 */
export function formatTime(date) {
  if (!date) return 'Time to be confirmed'
  return date.toLocaleTimeString(undefined, {
    timeZone: CLUB_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * "Fri, 24 Jul 2026" — the long form used in the detail sheet header,
 * always the Abu Dhabi calendar date.
 */
export function formatLongDate(date) {
  if (!date) return 'Date to be confirmed'
  return date.toLocaleDateString(undefined, {
    timeZone: CLUB_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Sorts events by start time. Ascending for what's coming up, descending
 * for results (most recent first). Never mutates the input array. Events
 * with an unparseable date sort last in either direction, so a bad row is
 * visible but never displaces real fixtures from the top of the list.
 */
export function sortByStart(events, direction = 'asc') {
  const factor = direction === 'desc' ? -1 : 1
  return [...events].sort((a, b) => {
    const aTime = eventDate(a)?.getTime()
    const bTime = eventDate(b)?.getTime()
    if (aTime == null && bTime == null) return 0
    if (aTime == null) return 1
    if (bTime == null) return -1
    return (aTime - bTime) * factor
  })
}
