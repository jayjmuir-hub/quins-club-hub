import { portionFraction, portionLabel, portionShort } from './pitchPortion.js'
import { eventDate, eventTimeLabel } from './eventFormat.js'
import { dayKey, dayKeyOf } from './calendarGrid.js'

// The MATH behind the shared-pitch bar and the pitch-layout diagram, kept pure
// and away from React so a test and both renderers read the same numbers.
//
// ⚠️ EXTRACTED FROM src/components/PitchCalendar.jsx ON 30 Aug 2026, NOT WRITTEN
// FRESH. shareSegments / occupancyStatus / fractionWord / squadOf / portionOf /
// peakEvent were module-private to that component. The share-as-image feature
// (the day and week pictures) needs the identical occupancy reading, and this
// codebase is explicit that two copies of one behaviour drift — so the functions
// moved here and PitchCalendar imports them back. No behaviour changed in the
// move; the occupancy panel renders exactly as before.
//
// Pure: pitchPortion, eventFormat and calendarGrid only, none of which touch
// Supabase — so this file (and its test) never pull the data layer or need a
// database env. The TBD placeholder lives in the data layer, so the SCREEN
// filters booked events before calling in; the builders below never see the
// placeholder and so never have to know its literal.

/** A share is "over" once its portions sum past one whole pitch. The epsilon is
 *  the same one capacity uses in src/data/pitches.js, so three thirds (0.999…)
 *  read as full rather than over. */
export const OVER = 1 + 1e-9

/** A share's segments, one per OCCUPANT — a fan-out (shared group_id) counts
 *  once, exactly as pitchLoad sums it, so the bar matches the load. Widest first. */
export function shareSegments(group) {
  const byOccupant = new Map()
  for (const event of group.events) {
    const key = event.group_id ? `g:${event.group_id}` : `e:${event.id}`
    const fraction = portionFraction(event.pitch_portion)
    const existing = byOccupant.get(key)
    if (!existing || fraction > existing.fraction) byOccupant.set(key, { key, event, fraction })
  }
  return [...byOccupant.values()].sort((a, b) => b.fraction - a.fraction)
}

// ⚠️ A CLUB-WIDE event (team_id null, 30 Aug 2026) has no squad, so it reads
// "Club" here rather than the "A squad" fallback — which the share card then
// abbreviated to a bare "A". It is a real booking on a pitch (a whole-club
// social), so it needs a name a coach can read on the layout.
export const squadOf = (event, teamsById) =>
  event.team_name ??
  teamsById?.get(event.team_id)?.name ??
  (event.team_id == null ? 'Club' : 'A squad')

export const portionOf = (event) => portionLabel(event.pitch_portion) ?? 'Full pitch'

/** The instant a share peaks — its latest start, when everyone is present. */
export const peakEvent = (group) =>
  group.events.reduce((a, b) => ((eventDate(b)?.getTime() ?? 0) > (eventDate(a)?.getTime() ?? 0) ? b : a))

/** A pitch fraction as words: 0.25 → "a quarter", ⅓ → "a third", 1.5 → "1.5 pitches".
 *  ⚠️ Portions are ¼, ⅓, ½ and 1, so any occupancy lands on a TWELFTH — the old
 *  "round to quarters" turned a third into "a quarter". Quantise to twelfths,
 *  name the fractions people actually say, and fall back to a rounded percentage
 *  for an odd mixed twelfth (a ¼ beside a ⅓ is 7⁄12) rather than "seven twelfths". */
export function fractionWord(fraction) {
  const named = { 3: 'a quarter', 4: 'a third', 6: 'a half', 8: 'two thirds', 9: 'three quarters', 12: 'a full pitch' }
  const twelfths = Math.round(fraction * 12)
  if (twelfths <= 0) return 'nothing'
  if (named[twelfths]) return named[twelfths]
  if (twelfths % 12 === 0) return `${twelfths / 12} pitches`
  if (fraction > 1) return `${Math.round(fraction * 100) / 100} pitches`
  return `${Math.round(fraction * 100)}%`
}

export function occupancyStatus(load) {
  if (load > OVER) return { over: true, text: `Over by ${fractionWord(load - 1)} — needs another pitch` }
  const free = 1 - load
  if (free < 1e-9) return { over: false, text: 'Full — nothing spare' }
  return { over: false, text: `${fractionWord(load)} used · ${fractionWord(free)} free` }
}

// ── The pitch-layout diagram ─────────────────────────────────────────────────
//
// The occupancy panel above answers "what's shared, and does it fit". The
// DIAGRAM answers a friendlier question — "draw me the ground": every pitch that
// has something on it at one moment, carved into the portions each squad takes,
// with the spare drawn as its own segment. The day and week share pictures are
// this, laid out for a screenshot (Jay, 30 Aug 2026).
//
// ⚠️ THE UNIT IS PITCH × START-TIME, NOT PITCH × DAY. A pitch used at 6pm and
// again at 8pm is two whole-pitch occupations, not one full pitch — merging them
// would draw a pitch that looks packed when in fact each booking had it to
// itself. So bookings are grouped by the time they start, then by pitch, exactly
// how the day reads: "6:00 PM — D1, D2, D3".

/** One carved pitch: its occupant segments (widest first), the spare left over,
 *  and the same over/full/free reading the occupancy bar gives. `events` are the
 *  bookings sharing this pitch at this moment. */
export function pitchBar(pitch, events, teamsById) {
  const raw = shareSegments({ events })
  const load = raw.reduce((sum, seg) => sum + seg.fraction, 0)
  const status = occupancyStatus(load)
  const segments = raw.map((seg) => ({
    key: seg.key,
    squad: squadOf(seg.event, teamsById),
    portionShort: portionShort(seg.event.pitch_portion) ?? 'full',
    portionLabel: portionOf(seg.event),
    fraction: seg.fraction,
  }))
  const spareFraction = Math.max(0, 1 - load)
  const spoken = `${pitch}: ${segments
    .map((seg) => `${seg.squad} ${seg.portionLabel.toLowerCase()}`)
    .join(', ')} — ${status.text}`
  return { pitch, segments, load, spareFraction, over: status.over, statusText: status.text, spoken }
}

/** A booked event is one on a real, named pitch. The SCREEN removes the TBD
 *  placeholder before calling in (it owns that constant); this only drops the
 *  genuinely blank, so the builder never has to import the data layer. */
const isBooked = (event) => Boolean((event?.pitch ?? '').trim())

/** Pitches with a booking on `pitch`, sorted D1, D2 … numerically like byPitch. */
function pitchNames(events) {
  return [...new Set(events.map((event) => event.pitch))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
}

/**
 * A day's bookings as `[{ timeLabel, timeMs, pitches: [pitchBar…] }]`, one entry
 * per start time (earliest first), each listing the pitches busy at that time.
 * `events` may be the whole loaded window; anything not booked, or on another
 * day, simply contributes nothing.
 */
export function diagramSlots(events, teamsById) {
  const booked = (events ?? []).filter(isBooked)
  const byTime = new Map()
  for (const event of booked) {
    const ms = eventDate(event)?.getTime() ?? 0
    const label = eventTimeLabel(event)
    const key = `${ms}|${label}`
    if (!byTime.has(key)) byTime.set(key, { timeLabel: label, timeMs: ms, events: [] })
    byTime.get(key).events.push(event)
  }
  return [...byTime.values()]
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((slot) => ({
      timeLabel: slot.timeLabel,
      timeMs: slot.timeMs,
      pitches: pitchNames(slot.events).map((pitch) =>
        pitchBar(
          pitch,
          slot.events.filter((event) => event.pitch === pitch),
          teamsById,
        ),
      ),
    }))
}

/**
 * A week as `[{ dayParts, empty, slots }]` aligned to `days` (the seven
 * `{ year, month, day }` parts from weekDays). Each day's slots come from
 * diagramSlots over just that day's bookings; an untouched day is `empty` so the
 * renderer can show a dash rather than nothing.
 */
export function diagramWeek(events, days, teamsById) {
  const booked = (events ?? []).filter(isBooked)
  const byDay = new Map()
  for (const event of booked) {
    const start = eventDate(event)
    if (!start) continue
    const key = dayKeyOf(start)
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(event)
  }
  return (days ?? []).map((dayParts) => {
    // dayKey(parts) is byte-for-byte what dayKeyOf(eventDate) produces for the
    // same club day (both 0-based month), so the grouping and the columns line
    // up without rebuilding a Date and risking the +04:00 boundary.
    const slots = diagramSlots(byDay.get(dayKey(dayParts)) ?? [], teamsById)
    return { dayParts, empty: slots.length === 0, slots }
  })
}
