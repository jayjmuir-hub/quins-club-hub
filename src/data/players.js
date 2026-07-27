import { supabase } from '../lib/supabase'

// Data access for the players and player_contacts tables. RLS already
// restricts rows to what the calling user's memberships allow. player_contacts
// exists as a separate table precisely so RLS can hide it (safeguarding) —
// a parent's query legitimately returns zero rows, which is not an error.
// Follows the throw-on-error convention set by src/data/members.js: callers
// get a thrown Error, never a {data, error} tuple, and [] rather than null
// for empty results.

/**
 * Lists players, optionally scoped to a set of team ids, ordered by
 * full_name ascending.
 *
 * teamIds semantics matter: an empty array means "no teams" and returns []
 * without querying at all. undefined/omitted means "no team filter" and
 * queries normally, letting RLS decide what comes back.
 */
export async function listPlayers({ teamIds } = {}) {
  if (Array.isArray(teamIds) && teamIds.length === 0) return []

  let query = supabase.from('players').select('*')
  if (Array.isArray(teamIds) && teamIds.length > 0) {
    query = query.in('team_id', teamIds)
  }
  query = query.order('full_name', { ascending: true })

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/**
 * Loads one player's contact row, or null when RLS returns nothing (the
 * expected outcome for a parent who isn't a coach/admin of that player's
 * team and isn't the player themselves — not an error). Uses maybeSingle()
 * rather than single(), which would throw on zero rows.
 */
export async function getPlayerContact(playerId) {
  const { data, error } = await supabase
    .from('player_contacts')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}
