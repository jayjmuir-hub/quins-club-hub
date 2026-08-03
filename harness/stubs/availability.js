// Harness stub replacing src/data/availability.js via a Vite alias. Same
// public shape (listAvailability, subscribeAvailability), fixed rows instead
// of a Supabase query, so the EventDetail availability summary renders a
// realistic three-segment bar.

const MIX = { in: 18, maybe: 4, out: 3 }

// Independent Task 16 verification addition: ?availDelay=<ms>, same reasoning
// as players.js's PLAYERS_DELAY — widens the fetch window so a stale-state
// flash while switching between two events' Availability sheets can actually
// be observed by Playwright rather than resolving within the same tick.
const AVAIL_DELAY = Number(new URLSearchParams(window.location.search).get('availDelay') || 0)

// Independent Task 16 verification addition: ?availFor=<eventId>:<status
// counts as a1,a2,...> is overkill; instead, real per-player rows keyed to
// the fixture ids used by the 'availability'/'schedule-*' scenarios, so the
// team-sheet's per-row status can be asserted against real player ids (p1,
// p13, ...) rather than only the count-only MIX fixture above, which used
// synthetic ids that never match a real player.
const REAL_ROWS = {
  e6: [
    { id: 'e6-a1', event_id: 'e6', player_id: 'p1', status: 'in' },
    { id: 'e6-a2', event_id: 'e6', player_id: 'p2', status: 'out' },
  ],
  e7: [{ id: 'e7-a1', event_id: 'e7', player_id: 'p13', status: 'maybe' }],
}

export async function listAvailability(eventId) {
  if (AVAIL_DELAY > 0) {
    await new Promise((resolve) => setTimeout(resolve, AVAIL_DELAY))
  }
  if (REAL_ROWS[eventId]) return REAL_ROWS[eventId]
  const rows = []
  let n = 0
  Object.entries(MIX).forEach(([status, count]) => {
    for (let i = 0; i < count; i += 1) {
      rows.push({ id: `${eventId}-a${n++}`, event_id: eventId, player_id: `p${n}`, status })
    }
  })
  return rows
}

// Independent Task 16 verification addition: exposes the realtime callback
// on window (keyed by event id) so a controller-side script can trigger a
// refresh on demand — same reasoning as tests/schedule.test.jsx reaching the
// mocked subscribeEvents callback via `subscribeEventsMock.mock.calls[0]`,
// just done through a global instead of a spy since this stub has no test
// runner behind it.
export function subscribeAvailability(eventId, callback) {
  window.__availabilityCallbacks = window.__availabilityCallbacks || {}
  window.__availabilityCallbacks[eventId] = callback
  return () => {
    if (window.__availabilityCallbacks) delete window.__availabilityCallbacks[eventId]
  }
}

// Harness addition for Task 5 (Overview screen verification): mirrors the
// real src/data/availability.js's listAvailabilityForEvents, which bulk-fetches
// across many event ids. Built from the same per-event listAvailability
// already defined above (REAL_ROWS/MIX), rather than inventing new fixture
// data, exactly as the plan asks.
export async function listAvailabilityForEvents(eventIds) {
  const results = []
  for (const eventId of eventIds) {
    results.push(...(await listAvailability(eventId)))
  }
  return results
}

export async function setAvailability(eventId, playerId, status) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'upsert', table: 'availability', payload: { event_id: eventId, player_id: playerId, status } })
  return { id: `${eventId}-${playerId}`, event_id: eventId, player_id: playerId, status }
}
