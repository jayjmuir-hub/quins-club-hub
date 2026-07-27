// Harness stub replacing src/data/availability.js via a Vite alias. Same
// public shape (listAvailability, subscribeAvailability), fixed rows instead
// of a Supabase query, so the EventDetail availability summary renders a
// realistic three-segment bar.

const MIX = { in: 18, maybe: 4, out: 3 }

export async function listAvailability(eventId) {
  const rows = []
  let n = 0
  Object.entries(MIX).forEach(([status, count]) => {
    for (let i = 0; i < count; i += 1) {
      rows.push({ id: `${eventId}-a${n++}`, event_id: eventId, player_id: `p${n}`, status })
    }
  })
  return rows
}

export function subscribeAvailability() {
  return () => {}
}
