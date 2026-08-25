// Group fixtures by the club calendar month (Abu Dhabi), preserving the
// caller's order. Schedule's long list is scannable by month; progressive
// reveal in the screen decides how many months to show at once.
//
// Every date goes through eventFormat — the same rule as ScheduleTable and
// the calendar grid. No Date#getMonth here.

import { clubDayParts, eventDate } from './eventFormat.js'

export function monthLabel(year, monthIndex) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(Date.UTC(year, monthIndex, 1))
}

/**
 * Bucket already-ordered events into club-calendar months.
 * Events without a parseable start are skipped (same as the calendar grid).
 */
export function groupEventsByMonth(events) {
  const groups = []
  const index = new Map()

  for (const event of events ?? []) {
    const date = eventDate(event)
    if (!date) continue
    const { year, month } = clubDayParts(date)
    const key = `${year}-${month}`
    let group = index.get(key)
    if (!group) {
      group = {
        key,
        year,
        month,
        label: monthLabel(year, month),
        events: [],
      }
      index.set(key, group)
      groups.push(group)
    }
    group.events.push(event)
  }

  return groups
}

/**
 * How many leading month groups to show before a "Show more months" control.
 * Month grouping is the main fix for the long wall; this only kicks in when
 * the list still spans many months. Never hides the next month behind a page
 * number — later months stay one click away in document order.
 */
export function initialVisibleMonthCount(groups, { minMonths = 3, softRows = 40 } = {}) {
  if (!groups?.length) return 0
  let rows = 0
  for (let i = 0; i < groups.length; i += 1) {
    rows += groups[i].events.length
    if (i + 1 >= minMonths && rows >= softRows) return i + 1
  }
  return groups.length
}

/**
 * Label for the progressive-reveal control. Names the next month so a coach
 * is not hunting through numbered pages for next month's games.
 */
export function showMoreMonthsLabel(remaining) {
  if (!remaining?.length) return null
  const next = remaining[0].label
  if (remaining.length === 1) return `Show ${next}`
  return `Show more months (${next} onwards)`
}
