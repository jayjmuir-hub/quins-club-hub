import { supabase } from '../lib/supabase'

// "This overload is fine" — the admin override for a pitch share that overtops
// the pitch but is genuinely OK (two small groups on one quarter, a one-off
// festival). Portions make the everyday share stop nagging on their own (see
// src/data/pitches.js); this is only for the rare real overflow that is still
// fine. The table and its reasoning are db/migrations/20260830_pitch_share_approvals.sql.
//
// ⚠️ KEYED TO THE EXACT SET OF BOOKINGS. shareKey is the involved events' ids,
// sorted and comma-joined — the SAME key findPitchClashes' cohort produces, so
// an approval clears that overload and no other, and a changed cohort (a fourth
// squad added) no longer matches and re-flags. Keep this in lockstep with the
// cohort's identity in pitches.js: both sort the ids, so both agree.

/**
 * The stable identity of a share: its events' ids, sorted, comma-joined.
 * Sorting is what makes it order-independent — the same set of bookings always
 * produces the same key however they arrive.
 */
export function shareKey(events) {
  return (events ?? [])
    .map((event) => event.id)
    .sort()
    .join(',')
}

/**
 * Every approved share the caller may see, as a Set of share keys — the shape
 * both screens want (an O(1) "is this overload approved?"). A failed read
 * returns an empty set rather than throwing: an unreachable approvals table
 * should leave the clash markers showing, never take the calendar down.
 */
export async function listShareApprovalKeys() {
  const { data, error } = await supabase.from('pitch_share_approvals').select('share_key')
  if (error) throw error
  return new Set((data ?? []).map((row) => row.share_key))
}

async function currentProfileId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const id = data?.user?.id
  if (!id) throw new Error('You need to be signed in to do that.')
  return id
}

const REFUSED =
  "We couldn't save that. Only an admin can mark a pitch clash as fine, and only for their own club."

/**
 * Marks a share's overload as approved. `events` is the clash cohort, and they
 * carry the club — a fixture always knows its own club_id (listEvents selects
 * it). Idempotent by the primary key: approving an already-approved share is an
 * upsert on `share_key`, not a duplicate or an error.
 */
export async function approveShare(events) {
  const club_id = events?.find((event) => event.club_id)?.club_id
  if (!club_id) throw new Error(REFUSED)
  const approved_by = await currentProfileId()
  const { data, error } = await supabase
    .from('pitch_share_approvals')
    .upsert({ share_key: shareKey(events), club_id, approved_by }, { onConflict: 'share_key' })
    .select()
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(REFUSED)
  return data
}

/** Takes an approval back, so the overload flags again. */
export async function unapproveShare(key) {
  const { error } = await supabase.from('pitch_share_approvals').delete().eq('share_key', key)
  if (error) throw error
}
