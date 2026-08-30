import { supabase } from '../lib/supabase'
import { upsertById } from './upsertById.js'
import { portionFraction } from '../lib/pitchPortion.js'

// The managed pitch list, and clash detection over it.
//
// ⚠️ `events.pitch` IS TEXT AND THERE IS NO FOREIGN KEY. The picker writes
// `pitches.name` into it and everything here groups on that text. The reasons
// are in db/migrations/20260811_pitches.sql and are worth not re-deciding by
// accident: `Pitch TBD` is a deliberate placeholder rather than a pitch (Jay's
// ruling — without it nobody can tell "not allocated yet" from "the app didn't
// say"), and it is more than half the existing rows.

/** The placeholder. Not a pitch, and never in the managed list. */
export const PITCH_TBD = 'Pitch TBD'

/**
 * Every pitch for the club, in display order.
 *
 * `includeRetired` exists for the management screen, which has to show a
 * retired pitch in order to bring it back. Everywhere else wants the pickable
 * ones only.
 */
export async function listPitches({ includeRetired = false } = {}) {
  let query = supabase.from('pitches').select('*')
  if (!includeRetired) query = query.eq('is_active', true)

  const { data, error } = await query
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * The club-wide booking picture, REDACTED — id, squad name, type, times,
 * pitch, group_id and nothing else. Comes from the pitch_occupancy SECURITY
 * DEFINER function (db/migrations/20260822_pitch_occupancy.sql) because
 * `event read` RLS deliberately scopes the events table to the reader's own
 * squads: a coach checking "is D2 free on Saturday?" needs to know WHO is
 * WHERE and WHEN across the club, and nothing more. Squad staff and admins
 * get rows; everyone else gets an empty list, refuse-by-empty as usual.
 */
export async function listPitchOccupancy({ from, to }) {
  const { data, error } = await supabase.rpc('pitch_occupancy', { _from: from, _to: to })
  if (error) throw error
  return data ?? []
}

const REFUSED =
  "We couldn't save that pitch. You may not have permission, or the name may already be in use."

/**
 * Creates or renames a pitch.
 *
 * ⚠️ RENAMING DOES NOT REWRITE THE FIXTURES THAT NAME IT. `events.pitch` is
 * text, so a rename here leaves every existing event pointing at the OLD
 * string — they keep rendering, and they stop matching the renamed pitch for
 * clash detection. That is a real consequence and the screen says so rather
 * than the rename silently half-working. Retiring and adding is usually what
 * somebody means.
 */
export async function upsertPitch(pitch) {
  return upsertById('pitches', pitch, { refusedMessage: REFUSED })
}

/**
 * Retires or restores a pitch.
 *
 * ⚠️ RETIRE, NEVER DELETE. A pitch closed for resurfacing must leave the
 * fixtures that already name it alone — and because `events.pitch` is text,
 * deleting the row would not even raise: it would just leave last season's
 * events naming a pitch nobody can look up.
 */
export async function setPitchActive(id, isActive) {
  const { data, error } = await supabase
    .from('pitches')
    .update({ is_active: Boolean(isActive) })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED)
  return data
}

// ── Clash detection ───────────────────────────────────────────────────────
//
// The thing the free-text pitch made impossible, and the reason the list
// exists. `claude/state-of-play.md` has carried "a managed pitch list is the
// precondition for clash detection" since 4 Aug.
//
// ⚠️ PURE, AND FED FROM EVENTS THE CALLER ALREADY HAS. No query of its own:
// Schedule and Dashboard have already read the events in scope through the
// paged reader, and a second round trip to re-read them would be slower and
// could disagree with what is on screen.
//
// ⚠️ IT REPORTS, IT DOES NOT REFUSE. A double-booked pitch is sometimes
// deliberate — two age groups sharing a full-size pitch for tag is normal —
// so this surfaces a warning and never blocks a save. Blocking would teach
// people to work around it by typing a different spelling, which is exactly
// the drift the list is here to end.
//
// ⚠️ IT IS A CAPACITY QUESTION, NOT A COLLISION ONE (Jay, 29 Aug 2026). A pitch
// is routinely SHARED — a quarter here, a half there — so two bookings on one
// pitch at one time are only a clash when the portions they use add up to MORE
// than a whole pitch. A quarter beside a half is fine; three halves is not. The
// portion lives on `events.pitch_portion` (see src/lib/pitchPortion.js); a
// booking with none set counts as a full pitch, so a database with no portions
// yet behaves exactly as the old pairwise detector did.

const CAPACITY = 1
// Portions are dyadic (¼, ½, 1) so their sums are exact in floating point, but
// a hair of slack keeps a legitimate "adds up to exactly one pitch" off the
// warning list even if a future portion is not.
const EPSILON = 1e-9

/**
 * The pitch load of a set of co-occupying events, in whole-pitch units.
 *
 * ⚠️ A SHARED group_id COUNTS ONCE. A multi-squad session is fanned out into
 * one event per squad, all on the same pitch at the same time by construction
 * (the 5 Aug fan-out decision) — it is ONE occupation of the ground, not one
 * per squad, so its portion is counted a single time. Without this every
 * multi-squad fixture would read as a pile-up and the feature would be switched
 * off within a week.
 */
// One OCCUPATION of the ground. A fan-out shares a group_id — one session
// across several squads, on the pitch once — so it is one occupant; anything
// else is its own. See the group_id note in pitchLoad.
function occupantKey(event) {
  return event.group_id ? `g:${event.group_id}` : `e:${event.id}`
}

/** Distinct occupations in a cohort — a share is two or more of these. */
function occupantCount(cohort) {
  return new Set(cohort.map(occupantKey)).size
}

function pitchLoad(cohort) {
  const byOccupant = new Map()
  for (const event of cohort) {
    const key = occupantKey(event)
    const fraction = portionFraction(event.pitch_portion)
    byOccupant.set(key, Math.max(byOccupant.get(key) ?? 0, fraction))
  }
  let total = 0
  for (const fraction of byOccupant.values()) total += fraction
  return total
}

/**
 * Groups of events whose portions overtop one pitch at the same time.
 *
 * Returns `[{ pitch, load, events }]`, where `load` is the summed portion in
 * whole-pitch units (> 1) and `events` is every booking sharing that overloaded
 * moment. A clash is just a SHARE that no longer fits, so this is pitchShares
 * filtered to the overloaded ones — see collectPitchShares for the engine.
 */
export function findPitchClashes(events) {
  return collectPitchShares(events).filter((group) => group.load > CAPACITY + EPSILON)
}

/**
 * Every set of squads SHARING a pitch — the occupancy view's data, and the
 * superset findPitchClashes filters down. Returns `[{ pitch, load, events }]`
 * for each MAXIMAL group of two or more bookings occupying one pitch at the same
 * moment, `load` their summed portion in whole-pitch units. A quarter beside a
 * half is a share at ¾ of a pitch; three halves is a share that overflows (and
 * so is also a clash).
 *
 * ⚠️ MAXIMAL, so a peak overlap {A,B,C} is one bar and not also its subset
 * {A,B}. Two share windows on one pitch that only touch at the edges stay
 * separate — neither contains the other — because they are two moments to look
 * at, not one.
 */
export function pitchShares(events) {
  // A share is two or more DIFFERENT occupations of one pitch. A fan-out (one
  // session across squads, sharing a group_id) is a single occupant, so it is
  // not a share on its own however many squad rows it carries.
  const groups = collectPitchShares(events).filter((group) => occupantCount(group.events) >= 2)
  const idSet = (group) => new Set(group.events.map((event) => event.id))
  return groups.filter((group, i) => {
    const mine = idSet(group)
    // Keep it unless another group on the SAME pitch strictly contains it.
    return !groups.some((other, j) => {
      if (j === i || other.pitch !== group.pitch || other.events.length <= group.events.length) return false
      const theirs = idSet(other)
      for (const id of mine) if (!theirs.has(id)) return false
      return true
    })
  })
}

/**
 * The shared engine: every cohort of two or more bookings occupying one pitch at
 * one instant, deduplicated by the exact set involved. Events with no pitch, or
 * the `Pitch TBD` placeholder, are ignored — "not allocated yet" cannot share
 * with anything, and treating 26 unallocated fixtures as one pile-up would bury
 * the real ones.
 *
 * ⚠️ `ends_at` IS NULLABLE, and that is the whole subtlety. A booking with a
 * real end occupies the half-open span [start, end) — so one ending at 18:00
 * and the next starting at 18:00 share a pitch cleanly (touching is not
 * overlapping, which is how a club runs a Saturday). A booking with NO end has
 * no duration to occupy a span with, so it can only load a pitch AT ITS OWN
 * START INSTANT, against other bookings starting at that same instant. Assuming
 * a default length would invent a clash, or invent the absence of one, from
 * data nobody entered. The two are handled in two passes for exactly that
 * reason.
 */
function collectPitchShares(events) {
  if (!Array.isArray(events)) return []

  const byPitch = new Map()
  for (const event of events) {
    const pitch = (event?.pitch ?? '').trim()
    if (!pitch || pitch === PITCH_TBD) continue
    // A tournament GAME lives inside its container: the container occupies the
    // pitch, the games must not count a second time. Both feeds already filter
    // them (listEvents and, since 30 Aug, the pitch_occupancy RPC); this keeps
    // the engine honest if a caller ever hands it an unfiltered list.
    if (event.tournament_id) continue
    if (Number.isNaN(Date.parse(event.starts_at))) continue // rubbish start: skip, never throw
    if (!byPitch.has(pitch)) byPitch.set(pitch, [])
    byPitch.get(pitch).push(event)
  }

  // Deduplicated by the exact set of events involved: the load is a pure
  // function of that set, so an identical cohort found from two anchors is
  // stored once, and a nested overlap {A,B} inside {A,B,C} stays a distinct
  // entry (pitchShares later drops the non-maximal ones for display).
  const groups = new Map()
  const record = (pitch, cohort) => {
    if (cohort.length < 2) return
    const key = `${pitch}|${cohort.map((event) => event.id).sort().join(',')}`
    if (!groups.has(key)) groups.set(key, { pitch, load: pitchLoad(cohort), events: cohort })
  }

  for (const [pitch, booked] of byPitch) {
    // ── Pass A — timed bookings. The load of half-open intervals is piecewise
    // constant and only ever rises at a start, so its peak is reached at one of
    // the start instants: testing each start finds every overload.
    const timed = booked.filter((event) => {
      const end = event.ends_at ? Date.parse(event.ends_at) : null
      return end !== null && !Number.isNaN(end)
    })
    for (const anchor of timed) {
      const t = Date.parse(anchor.starts_at)
      const cohort = timed.filter((event) => {
        const start = Date.parse(event.starts_at)
        const end = Date.parse(event.ends_at)
        return start <= t && t < end
      })
      record(pitch, cohort)
    }

    // ── Pass B — coincident starts. The ONLY way a booking with no end loads a
    // pitch: grouped by the exact start instant, so a no-end booking never
    // combines with a timed one that merely covers it, only with bookings that
    // begin at the very same moment.
    const byStart = new Map()
    for (const event of booked) {
      const start = String(Date.parse(event.starts_at))
      if (!byStart.has(start)) byStart.set(start, [])
      byStart.get(start).push(event)
    }
    for (const cohort of byStart.values()) record(pitch, cohort)
  }

  return [...groups.values()]
}
