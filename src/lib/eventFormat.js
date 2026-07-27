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
    month: date.toLocaleDateString(undefined, { month: 'short' }),
    day: String(date.getDate()),
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
  }
}

/**
 * "7:30 PM" — the time shown on fixture rows and in the detail sheet.
 */
export function formatTime(date) {
  if (!date) return 'Time to be confirmed'
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * "Fri, 24 Jul 2026" — the long form used in the detail sheet header.
 */
export function formatLongDate(date) {
  if (!date) return 'Date to be confirmed'
  return date.toLocaleDateString(undefined, {
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
