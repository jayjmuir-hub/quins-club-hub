import { supabase } from '../lib/supabase'

// Data access for the memberships table. RLS already restricts rows to the
// calling user, so no user id argument is needed here. Follows the
// throw-on-error convention set by src/lib/supabase.js and src/lib/auth.jsx
// — callers get a thrown Error, never a {data, error} tuple.

/**
 * Loads the current user's membership rows, each joined to its team.
 * Returns an array (never null) — empty for a signed-in user with no
 * memberships yet (e.g. an invite that hasn't been accepted).
 */
export async function loadMyMemberships() {
  const { data, error } = await supabase.from('memberships').select('*, teams(*)')
  if (error) throw error
  return data ?? []
}

/**
 * Lists every membership row club-wide, each joined to the member's profile
 * (for full_name) and their team (for name) — for the admin overview
 * (src/screens/Admin.jsx). Unlike loadMyMemberships, this is not scoped to
 * the caller: the `memb read` RLS policy on memberships is
 * `(profile_id = auth.uid()) OR is_admin(club_id)`, so an admin's query
 * genuinely returns every row in the club, not just their own — verified
 * directly against the live policy rather than assumed.
 *
 * There is deliberately no email column here: profiles has no email
 * (id, full_name, created_at only) — email lives solely in Supabase's
 * auth.users, which the client cannot query. A member row is person + role +
 * team, nothing more; do not add an email field that has nowhere to come
 * from.
 *
 * A non-admin calling this legitimately gets back only their own row(s) —
 * RLS does the narrowing, not this function — so it is safe to call from
 * any signed-in context, but Admin.jsx only does so once isAdmin() is true.
 */
export async function listClubMembers() {
  const { data, error } = await supabase.from('memberships').select('*, profiles(full_name), teams(name)')
  if (error) throw error
  return data ?? []
}
