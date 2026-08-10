// The date window the event screens read through.
//
// WHY IT EXISTS. `listEvents` has accepted `from`/`to` since it was written
// and no caller ever passed one, so every screen asked for every event in
// scope. `src/data/limits.js` capped that at MAX_ROWS and made truncation
// throw rather than silently return a short list — but a throw is still a
// broken screen. This is the thing that keeps the query under the cap in the
// first place.
//
// ⚠️ THIS IS A READ FILTER, NOT A RETENTION POLICY. Nothing is ever deleted.
// Events outside the window stay in the database permanently, stay in the
// calendar feed (`calendar_events_for_token` does not use this), and stay
// reachable by navigating the calendar, which refetches. The window only
// decides what is in the payload on first load.
//
// ── Why 12 months back, and why that number is not arbitrary ──────────────
//
// ⚠️ THE LOOKBACK MUST COVER A WHOLE SEASON FROM ANY POINT INSIDE IT, and the
// first proposal (3 months) failed that on Jay's question: "in 6 months will I
// still be able to see events from Sept?" With a 3-month lookback, no — in
// February the window would start in November, and **the Results tab would
// show nothing from September or October**. Results is derived from the same
// single fetch as Upcoming (see `results` in Schedule.jsx), so the read window
// decides exactly what the season-in-review screen can show. A season runs
// roughly September to May, so any lookback shorter than the season is wrong
// at every point after its first few months.
//
// 12 months back always covers the current season no matter when you look, and
// — unlike a fixed "season start / season end" — needs no season boundary
// stored anywhere, no annual edit, and does not hide the events either side of
// it (summer tournaments, pre-season).
//
// 6 months forward is comfortably past the end of a season being planned in
// its first weeks, and fixtures are rarely scheduled further out than that.
//
// ⚠️ WHAT THIS DOES NOT FIX: an admin viewing ALL squads. At roughly 75 events
// per squad per season (measured 10 Aug 2026: the two squads with realistic
// data run 2.0–2.3 events per active week), fifteen squads over 18 months is
// ~1,690 rows — over MAX_ROWS at any window boundary. That case needs
// pagination, not a narrower window, and the cap's throw is what makes it
// visible rather than silent.

/** Months of history the default window keeps. See the note above. */
export const MONTHS_BACK = 12

/** Months ahead the default window reaches. */
export const MONTHS_FORWARD = 6

/**
 * The default window, as ISO instants suitable for `listEvents({ from, to })`.
 *
 * ⚠️ Anchored on the CLUB's month, not the reader's. `clubToday()` is what
 * decides which month "now" is, for the same reason the calendar uses it: at
 * 01:00 in Abu Dhabi it is still the previous day in London, and a window
 * computed from the reader's clock would start a day early or late for anyone
 * outside the UAE. The boundaries are month edges, so this only matters at the
 * margin — but the margin is exactly where an off-by-one hides.
 *
 * @param {{year:number, month:number}} anchor  club month, `month` 0-based
 * @returns {{from:string, to:string}}
 */
export function defaultEventWindow(anchor) {
  return monthWindow(anchor, MONTHS_BACK, MONTHS_FORWARD)
}

/**
 * A window of whole months around an anchor month.
 *
 * `from` is the first instant of the month `back` months earlier; `to` is the
 * last instant of the month `forward` months later. Whole months rather than
 * "today minus 365 days" so that paging the calendar to a month inside the
 * window never lands on a partially-loaded month — half a month of fixtures
 * looks exactly like a quiet month, which is the silent-wrong-answer failure
 * this codebase keeps meeting.
 */
export function monthWindow({ year, month }, back, forward) {
  // Date.UTC normalises out-of-range months (month -3 rolls the year back), so
  // no wrapping arithmetic is needed here.
  const from = new Date(Date.UTC(year, month - back, 1, 0, 0, 0, 0))
  // Day 0 of the month AFTER the last one included = its final day, 23:59:59.999.
  const to = new Date(Date.UTC(year, month + forward + 1, 0, 23, 59, 59, 999))
  return { from: from.toISOString(), to: to.toISOString() }
}

/**
 * True when `anchor` falls outside `window` and the screen therefore needs a
 * wider fetch before it can show that month.
 *
 * ⚠️ THE CALENDAR CAN WALK OUT OF THE WINDOW, and without this it would render
 * an empty month rather than an unloaded one — a lie of exactly the kind
 * `limits.js` exists to prevent. Schedule uses this to widen its fetch when
 * someone pages past the edge.
 */
export function isMonthOutsideWindow({ year, month }, { from, to }) {
  const monthStart = Date.UTC(year, month, 1, 0, 0, 0, 0)
  const monthEnd = Date.UTC(year, month + 1, 0, 23, 59, 59, 999)
  return monthStart < Date.parse(from) || monthEnd > Date.parse(to)
}

/**
 * A window guaranteed to contain both the default window and `anchor`.
 *
 * Grows to whichever side is needed and keeps the other, so paging back three
 * years and forward again does not repeatedly refetch: the window only ever
 * gets wider within a session.
 */
export function windowCovering(anchor, current) {
  const monthStart = new Date(Date.UTC(anchor.year, anchor.month, 1, 0, 0, 0, 0))
  const monthEnd = new Date(Date.UTC(anchor.year, anchor.month + 1, 0, 23, 59, 59, 999))
  const from = Math.min(Date.parse(current.from), monthStart.getTime())
  const to = Math.max(Date.parse(current.to), monthEnd.getTime())
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() }
}
