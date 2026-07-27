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
