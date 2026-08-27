import { supabase } from '../lib/supabase'
import { fetchByIds } from './limits.js'

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

/**
 * Lists availability rows across many events in one query — used by the
 * Overview screen, which needs RSVP counts for every upcoming fixture across
 * however many teams are in scope, not just one event at a time the way
 * listAvailability(eventId) does. One .in('event_id', ...) query rather than
 * one round trip per fixture, matching the same teamIds-array pattern
 * src/data/events.js's listEvents({teamIds}) and src/data/players.js's
 * listPlayers({teamIds}) already use.
 *
 * An empty eventIds array returns [] without querying — there is nothing to
 * ask about, and (matching the existing teamIds convention) an empty input
 * must never be read as "no filter, return everything".
 */
export async function listAvailabilityForEvents(eventIds) {
  // ⚠️ CHUNKED SINCE 12 Aug 2026. This is fed the id of every fixture on
  // screen, and PostgREST takes `.in()` as a query STRING — ~37 bytes of URL
  // per uuid. Measured: 300 ids works, 400 makes the fetch THROW with a
  // connection failure rather than a status. The Dashboard's rolling window is
  // 12 months back and 6 forward, so an admin across fifteen squads is well
  // past that. See MAX_IN_LIST in ./limits.js.
  return fetchByIds(eventIds, async (chunk) => {
    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .in('event_id', chunk)
    if (error) throw error
    return data ?? []
  })
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

// A write the database refused is not an error as far as PostgREST is
// concerned: RLS filters the row out, the statement affects zero rows, and
// the response is a perfectly successful "nothing" — the same shape
// src/data/events.js and src/data/players.js already handle. Here that
// covers a parent trying to set availability for a player who is not their
// own child, and a coach/admin trying to set it for a player outside a
// team they may edit — both are the availability table's "availability
// write" RLS policy refusing, not this module deciding anything.
const REFUSED_AVAILABILITY =
  "We couldn't save that RSVP. You may not have permission to change it."

/**
 * Sets one player's availability status for one event, upserting on the
 * (event_id, player_id) conflict target — availability has no surrogate key
 * for that pair, so this is a genuine ON CONFLICT upsert, the same shape as
 * src/data/players.js's upsertContact against player_contacts (keyed by
 * player_id alone). The conflict target is named explicitly rather than
 * left to PostgREST's inference, so this keeps updating in place if the
 * table ever gains a second unique constraint.
 *
 * Returns the saved row. Throws — rather than writing an orphan row or
 * failing obscurely at a NOT NULL constraint — when eventId or playerId is
 * missing.
 */
export async function setAvailability(eventId, playerId, status) {
  if (!eventId || !playerId) {
    throw new Error('setAvailability needs both an event id and a player id.')
  }

  const { data, error } = await supabase
    .from('availability')
    .upsert({ event_id: eventId, player_id: playerId, status }, { onConflict: 'event_id,player_id' })
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_AVAILABILITY)
  return data
}

/**
 * Clears one player's availability for one event by deleting the
 * (event_id, player_id) row — "No response" is the absence of a row, so a
 * delete is how a status is unset. Returns the deleted rows.
 *
 * A delete that matches no visible row returns [] whether RLS refused it (the
 * self-edit lock is closed, or the caller may not edit this player) or the row
 * was already gone. The two are indistinguishable from the row count and the
 * desired end state — no row — holds either way, so this does not throw on []:
 * the caller (Availability.jsx) reconciles an empty result by refetching rather
 * than optimistically showing a removal the database may not have made.
 */
export async function clearAvailability(eventId, playerId) {
  if (!eventId || !playerId) {
    throw new Error('clearAvailability needs both an event id and a player id.')
  }

  const { data, error } = await supabase
    .from('availability')
    .delete()
    .eq('event_id', eventId)
    .eq('player_id', playerId)
    .select()

  if (error) throw error
  return data ?? []
}
