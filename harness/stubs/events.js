// Harness stub replacing src/data/events.js via a Vite alias. Same public
// shape (listEvents, subscribeEvents) as the real module, but returns a fixed
// fixture set instead of querying Supabase. Fixtures are pinned to July 2026
// (the repo's "today" is 2026-07-27) so the Calendar tab's default month is
// densely populated, and cover both teams, all three event types, and a mix
// of scored (Results) and unscored (Upcoming) rows.

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

export async function listEvents({ teamIds } = {}) {
  if (Array.isArray(teamIds) && teamIds.length === 0) return []
  if (Array.isArray(teamIds) && teamIds.length > 0) {
    return EVENTS.filter((event) => teamIds.includes(event.team_id))
  }
  return EVENTS
}

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
