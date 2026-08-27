import { supabase } from '../lib/supabase'
import { upsertById } from './upsertById.js'

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

/**
 * True when two events overlap in time.
 *
 * ⚠️ `ends_at` IS NULLABLE, and that is the whole difficulty. An event with no
 * end has no duration to overlap WITH, so two events are treated as clashing
 * only if they start at the same instant. Assuming a default duration would
 * invent a clash — or, worse, invent the absence of one — from data nobody
 * entered.
 */
function overlaps(a, b) {
  const aStart = Date.parse(a.starts_at)
  const bStart = Date.parse(b.starts_at)
  if (Number.isNaN(aStart) || Number.isNaN(bStart)) return false

  const aEnd = a.ends_at ? Date.parse(a.ends_at) : null
  const bEnd = b.ends_at ? Date.parse(b.ends_at) : null

  if (aEnd === null || bEnd === null) return aStart === bStart

  // Touching is not overlapping: a session ending at 18:00 and the next
  // starting at 18:00 share a pitch cleanly, which is how a club actually
  // runs a Saturday.
  return aStart < bEnd && bStart < aEnd
}

/**
 * Pairs of events booked on the same pitch at overlapping times.
 *
 * Returns `[{ pitch, a, b }]`. Events with no pitch, or with the `Pitch TBD`
 * placeholder, are ignored — "not allocated yet" cannot clash with anything,
 * and treating 26 unallocated fixtures as one enormous pile-up would bury the
 * real ones.
 */
export function findPitchClashes(events) {
  if (!Array.isArray(events)) return []

  const byPitch = new Map()
  for (const event of events) {
    const pitch = (event?.pitch ?? '').trim()
    if (!pitch || pitch === PITCH_TBD) continue
    if (!byPitch.has(pitch)) byPitch.set(pitch, [])
    byPitch.get(pitch).push(event)
  }

  const clashes = []
  for (const [pitch, booked] of byPitch) {
    const sorted = [...booked].sort((x, y) => Date.parse(x.starts_at) - Date.parse(y.starts_at))
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        // ⚠️ SAME group_id IS NOT A CLASH. A multi-squad session is fanned out
        // into one event per squad, all on the same pitch at the same time by
        // construction — see the 5 Aug fan-out decision. Reporting those would
        // make every multi-squad fixture look like a double booking, and the
        // feature would be switched off within a week.
        if (sorted[i].group_id && sorted[i].group_id === sorted[j].group_id) continue
        if (overlaps(sorted[i], sorted[j])) {
          clashes.push({ pitch, a: sorted[i], b: sorted[j] })
        }
      }
    }
  }
  return clashes
}
