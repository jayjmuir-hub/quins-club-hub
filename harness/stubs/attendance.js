// Stub for src/data/attendance.js — Squad Hub harness scenario (21 Aug 2026,
// built to reproduce Jay's black-on-black player-history sheet). p1 said in
// and was marked absent on e1 (the no-show), p2 was present.
export async function listAttendanceForEvents(eventIds) {
  const rows = [
    { id: 'a1', event_id: 'e1', player_id: 'p1', status: 'absent', recorded_at: '2026-07-03T17:00:00Z' },
    { id: 'a2', event_id: 'e1', player_id: 'p2', status: 'present', recorded_at: '2026-07-03T17:00:00Z' },
    { id: 'a3', event_id: 'e2', player_id: 'p1', status: 'present', recorded_at: '2026-07-05T15:00:00Z' },
  ]
  return rows.filter((row) => eventIds.includes(row.event_id))
}

// The rest of the real module's surface, for screens (Register) that ride
// along in the same bundle.
export const ATTENDANCE_STATUSES = ['present', 'absent', 'excused']

export async function listAttendance(eventId) {
  return listAttendanceForEvents([eventId])
}

export async function listAttendanceForPlayer() {
  return []
}

export async function setAttendance(eventId, playerId, status) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'upsert', table: 'attendance', payload: { event_id: eventId, player_id: playerId, status } })
  return { id: `${eventId}-${playerId}`, event_id: eventId, player_id: playerId, status }
}

export async function clearAttendance() {
  return []
}
