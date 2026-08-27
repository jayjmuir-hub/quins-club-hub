// Harness stub replacing src/data/events.js via a Vite alias. Same public
// shape (listEvents, subscribeEvents) as the real module, but returns a fixed
// fixture set instead of querying Supabase. They cover both teams, all three
// event types, and a mix of scored (Results) and unscored (Upcoming) rows.
//
// ⚠️ THE DATES BELOW ARE WRITTEN AGAINST 2026-07-27 AND SHIFTED TO TODAY at the
// bottom of this file. Read that block before changing any of them — the
// literals are a shape, not a schedule.

const T1 = 't1' // U12 Boys
const T2 = 't2' // U14 Boys

const VENUE = 'Zayed Sports City'

export const EVENTS = [
  // --- Scored (Results) -------------------------------------------------
  {
    id: 'e1',
    team_id: T1,
    type: 'match',
    opponent: 'Dubai Exiles',
    title: null,
    venue: VENUE,
    home: true,
    competition: 'UAE Youth League',
    starts_at: '2026-07-03T15:00:00Z',
    result_us: 31,
    result_them: 19,
  },
  {
    id: 'e2',
    team_id: T2,
    type: 'match',
    opponent: 'Jebel Ali Dragons',
    title: null,
    venue: 'The Sevens, Dubai',
    home: false,
    competition: 'UAE Youth League',
    starts_at: '2026-07-05T13:30:00Z',
    result_us: 12,
    result_them: 24,
  },
  {
    id: 'e3',
    team_id: T1,
    type: 'match',
    opponent: 'Abu Dhabi Saracens',
    title: null,
    venue: VENUE,
    home: true,
    competition: 'Capital Cup',
    starts_at: '2026-07-11T16:00:00Z',
    result_us: 17,
    result_them: 17,
  },
  {
    id: 'e4',
    team_id: T2,
    type: 'match',
    opponent: 'Al Ain Amblers',
    title: null,
    venue: 'Al Ain Sports Club',
    home: false,
    competition: 'UAE Youth League',
    starts_at: '2026-07-18T14:00:00Z',
    result_us: 45,
    result_them: 5,
  },
  {
    id: 'e5',
    team_id: T1,
    type: 'match',
    opponent: 'Bahrain RFC Colts',
    title: null,
    venue: VENUE,
    home: true,
    competition: 'Gulf Invitational',
    starts_at: '2026-07-24T15:30:00Z',
    result_us: 8,
    result_them: 21,
  },

  // --- Unscored (Upcoming) ----------------------------------------------
  {
    id: 'e6',
    team_id: T1,
    type: 'training',
    opponent: null,
    title: 'U12 Squad Training',
    venue: VENUE,
    home: null,
    competition: null,
    starts_at: '2026-07-28T15:30:00Z',
    // 19:30–21:00 Abu Dhabi. ends_at and notes arrived 8 Aug 2026; both are
    // nullable, so the fixtures below deliberately leave them off — the
    // browser check needs to see BOTH an event that has them and the many
    // that do not, because the detail sheet and the calendar feed each
    // behave differently in the two cases.
    ends_at: '2026-07-28T17:00:00Z',
    notes: 'Meet at the gate 30 minutes before. Bring both kits.',
    // Shared with e12: the two make a repeating series, so the detail
    // sheet's "This and N later sessions" delete can be exercised.
    series_id: 's-u12-training',
    result_us: null,
    result_them: null,
  },
  {
    id: 'e7',
    team_id: T2,
    type: 'training',
    opponent: null,
    title: 'U14 Contact & Conditioning',
    venue: 'Zayed Sports City — Pitch 3',
    home: null,
    competition: null,
    starts_at: '2026-07-28T17:00:00Z',
    result_us: null,
    result_them: null,
  },
  {
    id: 'e8',
    team_id: T1,
    type: 'match',
    opponent: 'Sharjah Wanderers',
    title: null,
    venue: VENUE,
    home: true,
    competition: 'UAE Youth League',
    starts_at: '2026-07-30T15:00:00Z',
    result_us: null,
    result_them: null,
  },
  {
    id: 'e9',
    team_id: T2,
    type: 'social',
    opponent: null,
    title: 'End of Season Family BBQ',
    venue: 'Quins Clubhouse',
    home: null,
    competition: null,
    starts_at: '2026-07-31T14:00:00Z',
    result_us: null,
    result_them: null,
  },
  {
    id: 'e10',
    team_id: T1,
    type: 'social',
    opponent: null,
    title: 'Presentation Night',
    venue: 'Zayed Sports City Function Room',
    home: null,
    competition: null,
    starts_at: '2026-07-31T16:30:00Z',
    result_us: null,
    result_them: null,
  },
  {
    id: 'e11',
    team_id: T2,
    type: 'match',
    opponent: 'Doha Dhows Under-14 Development Squad',
    title: null,
    venue: 'Doha, Qatar',
    home: false,
    competition: 'Gulf Invitational Tournament',
    starts_at: '2026-08-02T12:00:00Z',
    result_us: null,
    result_them: null,
  },
  {
    id: 'e12',
    team_id: T1,
    type: 'training',
    opponent: null,
    title: 'Pre-season Fitness',
    venue: VENUE,
    home: null,
    competition: null,
    starts_at: '2026-08-06T15:30:00Z',
    ends_at: '2026-08-06T17:00:00Z',
    series_id: 's-u12-training',
    result_us: null,
    result_them: null,
  },
  // Same day as e6/e7 to exercise the calendar's multi-dot cell.
  {
    id: 'e13',
    team_id: T2,
    type: 'social',
    opponent: null,
    title: 'Committee Meeting',
    venue: 'Quins Clubhouse',
    home: null,
    competition: null,
    starts_at: '2026-07-28T18:30:00Z',
    result_us: null,
    result_them: null,
  },
  // Day-boundary fixture, added with the Abu Dhabi timezone change. 21:00
  // UTC is 01:00 on the 21st in Dubai but still the 20th in UTC and London,
  // and 17:00 on the 20th in New York. It exists so the browser check can
  // see the calendar bucket it on the 21st — the cell a naive
  // browser-local implementation gets wrong.
  {
    id: 'e-boundary',
    team_id: T1,
    type: 'social',
    opponent: null,
    title: 'Late Night Touch',
    venue: VENUE,
    home: null,
    competition: null,
    starts_at: '2026-07-20T21:00:00Z',
    result_us: null,
    result_them: null,
  },
]

// ── The dates above are RELATIVE, not absolute ──────────────────────────────
//
// ⚠️ THEY ARE WRITTEN AS LITERALS AND THEN SHIFTED, AND BOTH HALVES MATTER.
// Every literal above encodes a deliberate RELATIONSHIP — e6/e7/e13 share a day
// so the calendar's multi-dot cell fires, e6/e12 share a series, e-boundary is
// 21:00 UTC so it lands on the following day in Abu Dhabi. Rewriting them as
// `today + n` by hand would put all of that at the mercy of whoever edits next.
// Shifting the whole set by one constant preserves every relationship exactly.
//
// ⚠️ THE REASON THIS EXISTS: pinned to July 2026, the set aged into the past and
// the Dashboard correctly rendered NEITHER the next-fixture hero NOR a single
// Upcoming row — `nextFixture` was null and `toPlay` was empty. PR #79 shipped
// its hero unverified in the browser for exactly this reason and said so in its
// own description. A verification harness that silently stops being able to
// render the thing under test is the same rot as the two dead screen imports
// documented in harness/main.jsx, and it deserved the same permanent fix rather
// than another hand-edit.
const ANCHOR = Date.UTC(2026, 6, 27) // the "today" the literals above were written against
const DAY_MS = 24 * 60 * 60 * 1000
// Whole days only, and floored to UTC midnight at both ends, so the shift never
// moves an event's time of day — which is what would break e-boundary.
const todayUTC = (() => {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
})()
const SHIFT_DAYS = Math.round((todayUTC - ANCHOR) / DAY_MS)

function shift(iso) {
  if (!iso) return iso
  return new Date(new Date(iso).getTime() + SHIFT_DAYS * DAY_MS).toISOString()
}

for (const event of EVENTS) {
  event.starts_at = shift(event.starts_at)
  event.ends_at = shift(event.ends_at)
}

export async function listEvents({ teamIds } = {}) {
  if (Array.isArray(teamIds) && teamIds.length === 0) return []
  if (Array.isArray(teamIds) && teamIds.length > 0) {
    return EVENTS.filter((event) => teamIds.includes(event.team_id))
  }
  return EVENTS
}

/**
 * One event by id, for the match sheet screen.
 *
 * ⚠️ MIRRORS THE REAL EMBED — `team` and `league_team` are nested objects, not
 * flat columns. The sheet reads `event.team.name` for the deadline rule and
 * `event.league_team.rcm_name` for the TEAM: line, so a stub returning the bare
 * row would render a sheet with no squad and no league team and the harness
 * would call it fine.
 */
// The squads the memberships stub uses, named the way the real club names
// them. ⚠️ "U14B Contact" and not "U14 Boys": src/lib/ageGroup.js parses the
// band off the FRONT of the name, and the match sheet's deadline rule reads
// that band — a stub name that failed to parse would render no deadline and
// the harness would show a screen the real app never produces.
const HARNESS_TEAMS = [
  { id: 't1', name: 'U12B Contact' },
  { id: 't2', name: 'U14B Contact' },
  { id: 't3', name: 'U18B Contact' },
]

export async function getEvent(id) {
  const event = EVENTS.find((row) => row.id === id)
  if (!event) return null
  return {
    ...event,
    team: HARNESS_TEAMS.find((team) => team.id === event.team_id) ?? null,
    league_team: event.league_team ?? { id: 'lt-1', rcm_name: 'ADHQ2', division: 'B' },
  }
}

// ⚠️ MIRRORS THE REAL MODULE'S EXPORT, and tests/harness-stubs.test.js is what
// forced it — adding REALTIME_DEBOUNCE_MS to src/data/events.js without adding
// it here turns every harness scenario dark at once, because harness/main.jsx
// imports every screen into one bundle. The VALUE is irrelevant to the harness
// (nothing here ever fires a change); only the export has to exist.
export const REALTIME_DEBOUNCE_MS = 400

export function subscribeEvents() {
  return () => {}
}

// Task 14 writes. No network and no Supabase: each call records its payload
// on window so the browser check can assert what the form ACTUALLY built —
// in particular that a typed 20:00 becomes the right UTC instant while the
// browser context is deliberately in a non-Dubai zone.
export async function upsertEvent(event) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: event?.id ? 'update' : 'insert', payload: event })
  return { id: event?.id ?? 'e-new', ...event }
}

// Repeating events. Recorded as ONE 'insert-many' entry carrying the whole
// batch, mirroring the real module's single multi-row insert — so a browser
// check can see both the number of rows and that they share one series_id.
export async function setAvailabilityOverride(eventId, value) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'update', table: 'events', payload: { id: eventId, availability_override: value } })
  return { id: eventId, availability_override: value }
}

export async function insertEvents(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return []
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'insert-many', payload: rows })
  return rows.map((row, index) => ({ id: `e-series-${index}`, ...row }))
}

export async function deleteEvent(id) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'delete', id })
}

// Deleting a series, future occurrences only (8 Aug 2026). The count and the
// delete are separate calls in the real module for a reason — the count is a
// READ (can_see_team) and the delete is a WRITE (can_edit_team), so they can
// legitimately disagree — and they stay separate here so the browser check
// sees the same two-step the app performs.
export async function countSeriesFrom(seriesId, fromStartsAt) {
  if (!seriesId || !fromStartsAt) return 0
  return EVENTS.filter(
    (event) => event.series_id === seriesId && event.starts_at >= fromStartsAt,
  ).length
}

export async function deleteSeriesFrom(seriesId, fromStartsAt) {
  const rows = EVENTS.filter(
    (event) => event.series_id === seriesId && event.starts_at >= fromStartsAt,
  )
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'delete-series', seriesId, fromStartsAt, count: rows.length })
  return rows
}

// The series EDIT pair, mirroring the real module's split: one statement for
// the fields whose value is the same on every occurrence, and an RPC for the
// time, which is computed from each occurrence's own date. Both record what
// they were asked to do on window.__writes so the browser check can assert the
// scope without a database.
export const SERIES_EDITABLE_FIELDS = [
  'type',
  'title',
  'opponent',
  'home',
  'venue',
  'competition',
  'pitch',
  'notes',
]

export async function updateSeriesFrom(seriesId, fromStartsAt, patch) {
  const fields = Object.fromEntries(
    Object.entries(patch ?? {}).filter(([key]) => SERIES_EDITABLE_FIELDS.includes(key)),
  )
  if (Object.keys(fields).length === 0) return []
  const rows = EVENTS.filter(
    (event) => event.series_id === seriesId && event.starts_at >= fromStartsAt,
  )
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'update-series', seriesId, fromStartsAt, fields, count: rows.length })
  return rows
}

export async function setSeriesTimeFrom(seriesId, fromStartsAt, hours, minutes) {
  const rows = EVENTS.filter(
    (event) => event.series_id === seriesId && event.starts_at >= fromStartsAt,
  )
  window.__writes = window.__writes || []
  window.__writes.push({
    op: 'set-series-time',
    seriesId,
    fromStartsAt,
    hours,
    minutes,
    count: rows.length,
  })
  return rows
}
