import { supabase } from '../lib/supabase'

// Data access for the availability table. RLS already restricts rows to
// what the calling user's memberships allow. There is no "no response"
// row — absence of a row for a player means they haven't responded, so an
// empty/partial result set here is expected, not an error condition.
// Follows the throw-on-error convention set by src/data/members.js: callers
// get a thrown Error, never a {data, error} tuple, and [] rather than null
// for empty results.

/**
 * Lists availability rows for a single event.
 */
export async function listAvailability(eventId) {
  const { data, error } = await supabase
    .from('availability')
    .select('*')
    .eq('event_id', eventId)
  if (error) throw error
  return data ?? []
}

// Suffixed so concurrent subscriptions to the same event (e.g. a list view
// and a detail view both watching it) get distinct realtime channel topics
// rather than colliding.
let channelSeq = 0

/**
 * Subscribes to realtime changes on the availability table, filtered
 * server-side to one event id (not filtered client-side in the callback).
 * Returns an unsubscribe function — call it from a useEffect cleanup. Safe
 * to call more than once.
 */
export function subscribeAvailability(eventId, callback) {
  const channel = supabase
    .channel(`availability-changes-${eventId}-${++channelSeq}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'availability', filter: `event_id=eq.${eventId}` },
      callback,
    )
    .subscribe()

  let unsubscribed = false
  return () => {
    if (unsubscribed) return
    unsubscribed = true
    supabase.removeChannel(channel)
  }
}
