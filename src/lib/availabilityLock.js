import { clubDateTimeInputs, clubWallTimeToUtc } from './eventFormat.js'

// Self-service availability closes a fixed number of CALENDAR DAYS before the
// event, measured in Abu Dhabi wall time (CLUB_TIME_ZONE). Matches close
// furthest out — a match squad is the hardest list to rebuild late — training
// the day before, socials never. Staff are never subject to this; the check is
// only ever asked about a parent/player editing their own child.
const LOCK_DAYS = { match: 5, training: 1 }

/**
 * The UTC instant at which self-service editing closes for this event, or null
 * when it never closes (a social, an unknown type, or an event with no start).
 */
export function availabilityLockInstant(event) {
  const days = LOCK_DAYS[event?.type]
  if (days == null) return null

  const startsAt = event?.starts_at ? new Date(event.starts_at) : null
  if (!startsAt || Number.isNaN(startsAt.getTime())) return null

  // The event's own calendar date in club time, then N days earlier.
  const { date } = clubDateTimeInputs(startsAt)
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day - days))
  const lockDate =
    `${shifted.getUTCFullYear()}-` +
    `${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-` +
    `${String(shifted.getUTCDate()).padStart(2, '0')}`

  // 00:00 Abu Dhabi on that day, expressed as a real instant — the same
  // wall-clock -> UTC path the event form writes starts_at with.
  const iso = clubWallTimeToUtc(lockDate, '00:00')
  return iso ? new Date(iso) : null
}

/** True when self-service editing is closed for this event at `now`. */
export function isAvailabilitySelfLocked(event, now = new Date()) {
  const instant = availabilityLockInstant(event)
  return instant != null && now.getTime() >= instant.getTime()
}
