import { supabase } from '../lib/supabase'
import { signStaffPhotoUrl } from './photos.js'

// The person card's one fetch. The DATABASE decides what comes back —
// member_contact_card nulls phone/email server-side unless the viewer is
// entitled (claude/plans/2026-08-26-person-card.md), so this file only
// reshapes. A missing row (no such profile, or the caller has no active
// membership) returns null and the card says so; it never invents fields.
export async function getPersonCard(profileId) {
  if (!profileId) return null
  const { data, error } = await supabase.rpc('member_contact_card', { _profile: profileId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null

  // Same private-bucket stance as the Squad contacts card: photo_path is an
  // object key, viewable only signed. One person, one sign — and the shared
  // cache in photos.js means a face already on screen costs nothing here.
  const photoUrl = row.photo_path ? await signStaffPhotoUrl(row.photo_path) : null

  return {
    profileId: row.profile_id,
    name: row.full_name,
    role: row.role,
    title: row.title,
    isSuper: row.is_super === true,
    squads: row.squads ?? [],
    phone: row.phone ?? null,
    email: row.email ?? null,
    photoUrl,
    focus:
      row.photo_focus_x == null && row.photo_focus_y == null
        ? null
        : { x: row.photo_focus_x, y: row.photo_focus_y },
  }
}
