// The Squad Hub's tracking maths — availability (what they SAID) beside
// attendance (what HAPPENED), across a season of one squad's events.
//
// Pure and import-free, the same rule as src/lib/scope.js and
// src/lib/minis.js: this is read by a screen and tested directly, and a lib
// that pulled React or supabase in would be unusable from a node test.
//
// ⚠️ AVAILABILITY IS NEVER COMPUTED FROM ATTENDANCE OR VICE VERSA. They share
// a grain — (event, player) — and nothing else: RSVP is intent, written
// before the event by the player or parent; attendance is fact, written
// after it by a coach. src/lib/features.js and src/data/attendance.js both
// carry the warning; this module exists to put the two SIDE BY SIDE, which is
// the only honest way to relate them. The one derived number here, the
// no-show count, names both halves explicitly: said "in", marked "absent".

/**
 * Attendance percentage: present / (present + absent), as a 0-100 integer.
 *
 * ⚠️ `excused` IS EXCLUDED FROM BOTH SIDES, per the ruling recorded on
 * listAttendanceForPlayer in src/data/attendance.js: a player away injured or
 * on holiday did not choose to miss it, and a ranked list that counts them
 * would put the recently injured at the bottom and call it commitment.
 *
 * Returns null — not 0 — when there is nothing to divide: a player with no
 * recorded register yet has an UNKNOWN percentage, and 0% would read as
 * "never turns up".
 */
export function attendancePercent({ present = 0, absent = 0 } = {}) {
  const denominator = present + absent
  if (denominator === 0) return null
  return Math.round((present / denominator) * 100)
}

/**
 * Rolls availability and attendance rows up into one grid the screen can
 * render without further arithmetic.
 *
 * Input rows are the raw table shapes: { event_id, player_id, status }.
 * Events may be in any order; they come back newest-first, because the
 * question a coach asks is "what happened lately", not "how did August 2025
 * open".
 *
 * Returns { events, rows } where each row is:
 *   {
 *     player,
 *     cells: Map(eventId -> { availability, attendance }),  // absent key = no row
 *     present, absent, excused,   // attendance tallies
 *     percent,                    // attendancePercent of the tallies, or null
 *     noShows,                    // said 'in', marked 'absent'
 *   }
 *
 * A missing row in either table is a fact worth showing ("no reply" / "not
 * recorded"), so cells carry undefined rather than inventing a status.
 */
export function buildTracking({ players = [], events = [], availabilityRows = [], attendanceRows = [] }) {
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.starts_at ?? 0) - new Date(a.starts_at ?? 0),
  )
  const eventIds = new Set(sortedEvents.map((event) => event.id))

  // (eventId, playerId) -> status, one map per table. Rows for events outside
  // the given list (e.g. a wider fetch window) are ignored rather than
  // counted into totals the grid does not show.
  const availabilityBy = new Map()
  for (const row of availabilityRows) {
    if (eventIds.has(row.event_id)) availabilityBy.set(`${row.event_id}:${row.player_id}`, row.status)
  }
  const attendanceBy = new Map()
  for (const row of attendanceRows) {
    if (eventIds.has(row.event_id)) attendanceBy.set(`${row.event_id}:${row.player_id}`, row.status)
  }

  const rows = players.map((player) => {
    const cells = new Map()
    let present = 0
    let absent = 0
    let excused = 0
    let noShows = 0

    for (const event of sortedEvents) {
      const availability = availabilityBy.get(`${event.id}:${player.id}`)
      const attendance = attendanceBy.get(`${event.id}:${player.id}`)
      if (availability !== undefined || attendance !== undefined) {
        cells.set(event.id, { availability, attendance })
      }
      if (attendance === 'present') present += 1
      else if (attendance === 'absent') absent += 1
      else if (attendance === 'excused') excused += 1
      if (availability === 'in' && attendance === 'absent') noShows += 1
    }

    return {
      player,
      cells,
      present,
      absent,
      excused,
      percent: attendancePercent({ present, absent }),
      noShows,
    }
  })

  return { events: sortedEvents, rows }
}

/**
 * The squad-level summary line: how many registers were taken at all, and the
 * overall present rate across every recorded (event, player) pair. Uses the
 * same excused-exclusion as the per-player figure — one rule, two surfaces.
 */
export function squadSummary(rows) {
  let present = 0
  let absent = 0
  let excused = 0
  let noShows = 0
  for (const row of rows) {
    present += row.present
    absent += row.absent
    excused += row.excused
    noShows += row.noShows
  }
  return { present, absent, excused, noShows, percent: attendancePercent({ present, absent }) }
}
