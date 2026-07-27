import { supabase } from '../lib/supabase'

// Data access for the events table. RLS already restricts rows to what the
// calling user's memberships allow (admins get every event, coaches/parents/
// players only their own team's) — no permission filtering happens here.
// Follows the throw-on-error convention set by src/data/members.js: callers
// get a thrown Error, never a {data, error} tuple, and [] rather than null
// for empty results.

/**
 * Lists events, optionally scoped to a set of team ids and/or a starts_at
 * date range, always ordered by starts_at ascending.
 *
 * teamIds semantics matter: an empty array means "no teams" and returns []
 * without querying at all (e.g. a user with no visible squads must not see
 * the whole club by accident). undefined/omitted means "no team filter" and
 * queries normally, letting RLS decide what comes back.
 */
export async function listEvents({ teamIds, from, to } = {}) {
  if (Array.isArray(teamIds) && teamIds.length === 0) return []

  let query = supabase.from('events').select('*')
  if (Array.isArray(teamIds) && teamIds.length > 0) {
    query = query.in('team_id', teamIds)
  }
  if (from) query = query.gte('starts_at', from)
  if (to) query = query.lte('starts_at', to)
  query = query.order('starts_at', { ascending: true })

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/**
 * Subscribes to realtime changes on the events table. Returns an unsubscribe
 * function — call it from a useEffect cleanup. Safe to call more than once.
 */
export function subscribeEvents(callback) {
  const channel = supabase
    .channel('events-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, callback)
    .subscribe()

  let unsubscribed = false
  return () => {
    if (unsubscribed) return
    unsubscribed = true
    supabase.removeChannel(channel)
  }
}
