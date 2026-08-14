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
 * Every event time in this app renders in Abu Dhabi time, whoever is
 * reading it. The club has one home ground, so "20:00" has to mean 20:00 at
 * Zayed Sports City for a parent checking fixtures from London as much as
 * for one standing on the touchline — otherwise that parent reads a 20:00
 * kick-off as 16:00 and turns up four hours late.
 *
 * This is an IANA zone identifier, deliberately not a fixed '+04:00'
 * offset. The UAE has no DST today, so the two currently agree — but an
 * offset is a derived fact that would silently rot if that ever changed,
 * whereas the zone identifier stays correct by definition. Everything here
 * goes through Intl's `timeZone` option rather than any local-Date getter.
 *
 * This is a PRESENTATION concern only. starts_at is timestamptz and stays
 * UTC in the database; upcoming-vs-past is an instant comparison and is
 * already zone-agnostic (see sortByStart / hasResult — neither is touched
 * by any of this).
 */
export const CLUB_TIME_ZONE = 'Asia/Dubai'

// Locale is pinned to en-US here on purpose, and only here: this formatter
// exists to extract *numbers*, never to produce user-visible text, and a
// locale like ja-JP would return "24日" for a numeric day. The user-facing
// formatters below still use the reader's own locale.
//
// Built once at module load and reused. That is safe despite the tests
// changing process.env.TZ underneath it, because the timeZone is bound
// explicitly to CLUB_TIME_ZONE — this formatter never consults the ambient
// zone, which is the entire point.
const CLUB_PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: CLUB_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

/**
 * The calendar year/month/day an instant falls on **in club time**, as
 * plain numbers (month is 0-based, matching Date's convention).
 *
 * This is what day-bucketing and "is this today" must be built on. A 01:00
 * Dubai kick-off is 21:00 the previous day in UTC and 22:00 the previous
 * evening in London, so reading date.getDate() would file it under the
 * wrong day — a wrong, visible calendar cell for whoever is reading.
 */
export function clubDayParts(date) {
  const parts = CLUB_PARTS_FORMAT.formatToParts(date)
  const value = (type) => Number(parts.find((part) => part.type === type).value)
  return { year: value('year'), month: value('month') - 1, day: value('day') }
}

/**
 * Today's date in club time. Used for the calendar's "today" ring and for
 * which month it opens on — both of which must follow Abu Dhabi's day, not
 * the reader's.
 */
export function clubToday() {
  return clubDayParts(new Date())
}

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
  // ⚠️ A TOURNAMENT IS NOT PLAYED AGAINST ONE SIDE, so it is named rather than
  // opposed — "Al Ain Tournament", never "Quins vs Al Ain Tournament".
  // Reported by Jay from the live schedule, 14 Aug 2026.
  //
  // ⚠️ THE BUG WAS THE REQUIRED OPPONENT FIELD, NOT THIS FUNCTION. A match
  // could not be saved without an opponent, and a tournament has none, so the
  // only way to enter one was to type the tournament's name into the opponent
  // box — after which "Quins vs <opponent>" was doing exactly what it was told.
  // EventForm no longer requires an opponent for a tournament; this branch is
  // what makes the rows already carrying that workaround read correctly, with
  // no data migration.
  //
  // ⚠️ AHEAD OF THE OPPONENT CHECK ON PURPOSE. Those existing rows hold the
  // tournament name in BOTH columns, so an opponent-first order would keep
  // rendering the old string for every fixture already entered.
  if (event?.type === 'match' && event.competition_type === 'tournament' && event.competition) {
    return event.competition
  }
  if (event?.type === 'match' && event.opponent) return `Quins vs ${event.opponent}`
  if (event?.title) return event.title
  if (event?.type === 'match') return 'Quins match'
  return 'Club event'
}

/**
 * True when an event's stored title says nothing the type chip beside it does
 * not already say — a training called "Training", a social called "Social".
 *
 * ⚠️ THIS EXISTS BECAUSE THE ROW SAID THE SAME WORD TWICE. FixtureRow renders
 * a type chip and then the title directly beneath it, so a coach who types
 * "Training" into the title field (which is the obvious thing to type, and
 * what every seeded session says) gets a green "Training" chip stacked on a
 * bold "Training" heading. The heaviest type on the row carries the one piece
 * of information already given immediately above it.
 *
 * Suppressing it is not just tidiness: with the title gone, the bold slot in a
 * list belongs only to the events that have something distinctive to say — a
 * match, or a session someone bothered to name. Scanning a month for "what is
 * different this week" becomes reading the bold lines, which is the question
 * people actually bring to the schedule.
 *
 * ⚠️ COMPARES AGAINST THE TYPE, NOT A LIST OF WORDS. "Extra session before
 * Saracens" is a training and keeps its title, because it is not the word
 * "training". Only the exact echo is dropped.
 *
 * A blank title is FALSE, not true: eventTitle's own fallbacks handle that
 * case, and conflating the two would hide the fallback as well.
 */
export function titleRepeatsType(event) {
  const title = String(event?.title ?? '').trim().toLowerCase()
  if (!title) return false
  return title === String(event?.type ?? '').trim().toLowerCase()
}

/**
 * The eyebrow above the dashboard hero: "Next fixture", "Next training",
 * "Next social" or "Next up".
 *
 * ⚠️ THIS EXISTS BECAUSE THE HERO LIED. The hero picks the next MATCH and
 * falls back to the next event of any type when there is no match coming —
 * a deliberate design, so the screen is never empty out of season. But the
 * eyebrow was the hardcoded string "Next fixture", so a training session
 * appeared under a heading calling it a fixture. Spotted by Jay on 6 Aug
 * 2026, on the live dashboard, where the only upcoming event in the whole
 * club was a training session.
 *
 * "Fixture" is not a loose synonym for "event" in rugby — it means a match
 * against another side, which is exactly the thing a parent is checking for.
 */
export function nextEventLabel(event) {
  if (event?.type === 'match') return 'Next fixture'
  if (event?.type === 'training') return 'Next training'
  if (event?.type === 'social') return 'Next social'
  // Unknown or missing type: say something true rather than guess.
  return 'Next up'
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
 * The same for ends_at — the column added 8 Aug 2026 (see
 * db/migrations/20260808_event_end_time_and_notes.sql). Separate from
 * eventDate() rather than a parameterised one, because the two are NOT
 * interchangeable at the call sites: a missing starts_at is a broken row,
 * whereas a missing ends_at is the ordinary state of every event created
 * before that migration and of anything a future external fixture feed
 * sends us. Callers must be able to tell those apart.
 */
export function eventEndDate(event) {
  if (!event?.ends_at) return null
  const date = new Date(event.ends_at)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * The three lines of the fixture row's date box (design-system.md §4.13):
 * short month, day of month, short weekday.
 */
export function dateBoxParts(date) {
  if (!date) return { month: '—', day: '–', weekday: '' }
  return {
    month: date.toLocaleDateString(undefined, { timeZone: CLUB_TIME_ZONE, month: 'short' }),
    // Read off clubDayParts rather than a `day: 'numeric'` format, which in
    // some locales appends a unit ("24日") — the date box wants a bare
    // number.
    day: String(clubDayParts(date).day),
    weekday: date.toLocaleDateString(undefined, { timeZone: CLUB_TIME_ZONE, weekday: 'short' }),
  }
}

/**
 * "7:30 PM" — the time shown on fixture rows and in the detail sheet,
 * always the Abu Dhabi wall-clock time (see CLUB_TIME_ZONE).
 */
export function formatTime(date) {
  if (!date) return 'Time to be confirmed'
  return date.toLocaleTimeString(undefined, {
    timeZone: CLUB_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * "6:00 PM – 7:30 PM" — a start and a finish, for the detail sheet header.
 *
 * ⚠️ FALLS BACK TO THE START ALONE WHEN THERE IS NO END, and that is the
 * common case, not the edge one: `ends_at` is nullable on purpose (the
 * migration explains why — an external fixture feed that cannot supply one
 * must not hard-fail), so every event created before 8 Aug 2026 renders
 * exactly as it did before this function existed. Do NOT "fix" this by
 * substituting the calendar feed's per-type duration guess: that guess is a
 * defensible way to fill a required ICS field, and an indefensible thing to
 * show a parent as though the club had said it.
 *
 * A spaced en dash, matching resultScore()'s en dash — a hyphen between two
 * times reads as a typo on screen, and an unspaced dash between "6:00 PM"
 * and "7:30 PM" runs the two together at this size.
 *
 * Both halves go through formatTime, so both are Abu Dhabi wall-clock and a
 * zone bug can never reach one end without reaching the other.
 */
export function formatTimeRange(start, end) {
  if (!start) return formatTime(null)
  if (!end) return formatTime(start)
  return `${formatTime(start)} – ${formatTime(end)}`
}

/**
 * The label used wherever a fixture's kick-off is shown. Matches `Pitch TBD`,
 * the wording the pitch picker already settled on.
 */
export const TIME_TBD = 'Time TBD'

/**
 * Whether this event's stored clock time is a placeholder rather than a
 * kick-off (added 14 Aug 2026, Jay).
 *
 * ⚠️ THE FLAG IS THE ONLY TRUTH, AND THIS FUNCTION IS WHY IT IS A FUNCTION
 * RATHER THAN A `.time_tbd` READ AT TWELVE CALL SITES. `starts_at` is
 * `timestamptz NOT NULL` and stays that way — the schedule orders, ranges and
 * pages on it — so a TBD fixture still holds a real instant, and the app writes
 * midnight club time as the placeholder. NOTHING MAY INFER TBD FROM THAT
 * MIDNIGHT: a genuine 00:00 social is a legal fixture, and reading the clock to
 * decide would render it as "time unknown" forever. The column comment in
 * db/migrations/20260814_competition_tbd_and_time_tbd.sql says the same from the
 * other side.
 *
 * Strict `=== true` so a row that has not selected the column — an older cached
 * read, a narrower `select` — is treated as "has a time", which is the state
 * every fixture in the database had before the column existed.
 */
export function isTimeTbd(event) {
  return event?.time_tbd === true
}

/**
 * "7:30 PM", or "Time TBD" when the kick-off is not yet known.
 *
 * ⚠️ TAKES THE EVENT, NOT A DATE, and that is the whole point: `formatTime`
 * cannot see the flag, so every call site that renders an event's time from
 * `formatTime(eventDate(event))` would silently print the placeholder midnight.
 * Prefer this at every event-facing call site. `formatTime` stays for the places
 * that format an instant which is not an event's kick-off at all — a notice's
 * read receipt, a pitch request's window.
 */
export function eventTimeLabel(event) {
  if (isTimeTbd(event)) return TIME_TBD
  return formatTime(eventDate(event))
}

/**
 * The detail sheet's "6:00 PM – 7:30 PM", TBD-aware.
 *
 * ⚠️ NO RANGE IS EVER SHOWN FOR A TBD FIXTURE, and it cannot be: the database
 * refuses an `ends_at` while `time_tbd` is true (`events_no_end_when_time_tbd`),
 * because a real finish against a placeholder midnight would render as a
 * fifteen-hour event in every parent's calendar.
 */
export function eventTimeRangeLabel(event) {
  if (isTimeTbd(event)) return TIME_TBD
  return formatTimeRange(eventDate(event), eventEndDate(event))
}

/**
 * "Mon 01 Sept" — the desktop schedule table's date cell.
 *
 * ⚠️ THIS EXISTS BECAUSE ScheduleTable.jsx WAS DOING IT ITSELF. It called
 * `date.toLocaleDateString('en-GB', { day, month, timeZone: 'Asia/Dubai' })`
 * inline — the one place in that file that hardcoded the zone string instead
 * of using CLUB_TIME_ZONE, contradicting its own header comment ("This file
 * therefore does no date arithmetic of its own"). A typo there would have
 * shifted the club's calendar in one column and nowhere else, which is
 * precisely the bug that comment exists to prevent.
 *
 * The weekday leads because that is what someone scanning a season is
 * actually looking for: "which nights do we train?" is a more common question
 * than "what is the date of the fourth session?".
 *
 * ⚠️ LOCALE IS `undefined`, NOT 'en-GB'. Every other formatter in this file
 * takes the browser's locale and pins only the ZONE; hardcoding en-GB here
 * would make this the one date in the app that ignores the reader's settings.
 * (en-GB renders September as "Sept", en-US as "Sep" — either is fine.)
 */
export function formatTableDate(date) {
  if (!date) return 'Date TBC'
  return date.toLocaleDateString(undefined, {
    timeZone: CLUB_TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}

/**
 * "Fri, 24 Jul 2026" — the long form used in the detail sheet header,
 * always the Abu Dhabi calendar date.
 */
export function formatLongDate(date) {
  if (!date) return 'Date to be confirmed'
  return date.toLocaleDateString(undefined, {
    timeZone: CLUB_TIME_ZONE,
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

// --- Writing: club wall-clock -> UTC ---------------------------------
//
// Everything above turns a stored instant into Abu Dhabi wall-clock for
// display. Task 14's event form needs the mirror image (design-system.md §7,
// "Writing"): the date and time a coach types ARE Abu Dhabi wall-clock, and
// have to become the right UTC instant before they're written to starts_at.
//
// The naive `new Date(`${date}T${time}`)` resolves in the *browser's* zone,
// so a coach entering 20:00 from London would store 19:00Z — a 23:00 Abu
// Dhabi kick-off. Hardcoding '+04:00' would be correct today and would rot
// silently if the UAE ever adopted DST, which is the same reason
// CLUB_TIME_ZONE is an IANA identifier rather than an offset. So the offset
// is *derived from the zone, at the instant in question*, via Intl — the
// only abstraction that stays correct by definition.

// Second-precision club-time field extractor. hourCycle h23 keeps midnight
// as "00" rather than en-US's default "24", which Number() would read as
// hour 24 and silently roll a midnight kick-off onto the wrong day.
const CLUB_FIELDS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: CLUB_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function clubFields(date) {
  const parts = CLUB_FIELDS_FORMAT.formatToParts(date)
  const value = (type) => Number(parts.find((part) => part.type === type).value)
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

/**
 * The club zone's UTC offset in milliseconds at a given instant. Positive
 * east of Greenwich (+4h for Dubai today). Derived by asking Intl what the
 * club's wall clock reads at that instant and subtracting the instant
 * itself — so it follows whatever rules the zone has, DST or not.
 */
function clubOffsetMsAt(timestamp) {
  const f = clubFields(new Date(timestamp))
  const wallAsUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second)
  // Drop sub-second precision on both sides: zone offsets are whole minutes,
  // and formatToParts has no milliseconds to give back.
  return wallAsUtc - Math.floor(timestamp / 1000) * 1000
}

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_INPUT = /^(\d{2}):(\d{2})(?::\d{2})?$/

/**
 * Converts a form's `<input type="date">` value ("2026-07-30") and
 * `<input type="time">` value ("20:00", or "20:00:00" in some browsers),
 * both understood as **Abu Dhabi wall-clock**, into the UTC ISO string to
 * write to events.starts_at. Returns null when either value is missing or
 * isn't in the input element's own format — callers treat that as a
 * validation failure rather than writing an Invalid Date.
 */
export function clubWallTimeToUtc(dateValue, timeValue) {
  const dateMatch = DATE_INPUT.exec(String(dateValue ?? ''))
  const timeMatch = TIME_INPUT.exec(String(timeValue ?? ''))
  if (!dateMatch || !timeMatch) return null

  const [, year, month, day] = dateMatch.map(Number)
  const [, hour, minute] = timeMatch.map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null

  // Treat the typed wall-clock as if it were UTC, then subtract the club's
  // offset to get the real instant. The offset has to be looked up *at that
  // instant*, which is circular — so look it up at the first approximation
  // and then again at the result. One refinement is enough for any real
  // zone: the two only differ within an hour of a DST transition, and the
  // second lookup lands on the correct side of it.
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute)
  const firstPass = wallAsUtc - clubOffsetMsAt(wallAsUtc)
  const timestamp = wallAsUtc - clubOffsetMsAt(firstPass)
  return new Date(timestamp).toISOString()
}

/**
 * The inverse: splits an instant into the `<input type="date">` /
 * `<input type="time">` values an edit form prefills with, in club time.
 * Time is 24-hour and zero-padded because that is the only value format a
 * time input accepts. Returns empty strings for a missing or unparseable
 * date, so the form renders blank fields rather than "Invalid Date".
 */
export function clubDateTimeInputs(date) {
  if (!date || Number.isNaN(date.getTime())) return { date: '', time: '' }
  const f = clubFields(date)
  const pad = (n) => String(n).padStart(2, '0')
  return {
    date: `${f.year}-${pad(f.month)}-${pad(f.day)}`,
    time: `${pad(f.hour)}:${pad(f.minute)}`,
  }
}

/**
 * "Zayed Sports City, Abu Dhabi · Pitch 2" — where the event is, as one
 * line, for the compact places that already showed the venue and have room
 * for one string and not two (FixtureRow, Dashboard's hero, the schedule
 * table's Venue cell).
 *
 * Returns '' when neither is set, so callers keep using the same
 * `{line && ...}` guard they used for `event.venue` and an event with no
 * venue renders exactly as it did before this existed. EventDetail
 * deliberately does NOT use this — it has the room to show Venue and Pitch
 * as separate labelled rows, which is more useful when you are standing in
 * a car park looking for pitch 4.
 */
export function venueLine(event) {
  const venue = (event?.venue ?? '').trim()
  const pitch = (event?.pitch ?? '').trim()
  if (venue && pitch) return `${venue} · ${pitch}`
  return venue || pitch || ''
}
