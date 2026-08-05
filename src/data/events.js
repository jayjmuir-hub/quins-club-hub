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

// Suffixed so concurrent subscriptions (e.g. dashboard + schedule screens
// both mounted) get distinct realtime channel topics rather than colliding.
let channelSeq = 0

/**
 * Subscribes to realtime changes on the events table. Returns an unsubscribe
 * function — call it from a useEffect cleanup. Safe to call more than once.
 */
export function subscribeEvents(callback) {
  const channel = supabase
    .channel(`events-changes-${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, callback)
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
// the response is a perfectly successful "nothing". Both writers below ask
// for the affected row back and treat "no row" as a refusal, so the form
// shows a real message instead of a false "Saved". The check is a
// *reporting* mechanism, not an access control — can_edit_team() on the
// events table's "event edit" policy (USING and WITH CHECK) is what actually
// decides, server-side, and nothing here can widen it.
const REFUSED = "We couldn't save that. You may not have permission to change this squad's fixtures."
const REFUSED_DELETE =
  "We couldn't delete that. You may not have permission to change this squad's fixtures."

/**
 * Creates or updates one event. Inserts when `event` has no id, updates the
 * matching row when it has one — the id is used only as the filter and is
 * never sent as a column either way. Returns the saved row.
 *
 * Every field is passed through as given; in particular starts_at must
 * already be a UTC instant built from Abu Dhabi wall-clock (see
 * clubWallTimeToUtc in src/lib/eventFormat.js), never a browser-local Date.
 */
export async function upsertEvent(event) {
  const { id, ...fields } = event ?? {}

  const query = id
    ? supabase.from('events').update(fields).eq('id', id).select().maybeSingle()
    : supabase.from('events').insert(fields).select().maybeSingle()

  const { data, error } = await query
  if (error) throw error
  if (!data) throw new Error(REFUSED)
  return data
}

const REFUSED_BATCH =
  "We couldn't save those sessions. You may not have permission to change this squad's fixtures."

/**
 * Inserts many events in ONE statement and returns the saved rows.
 *
 * One statement, not a loop of upsertEvent calls, because a term of training
 * is all-or-nothing: Postgres runs a multi-row INSERT in a single implicit
 * transaction, so a row the database refuses rolls the whole batch back
 * rather than leaving a coach with the first nine Tuesdays created and the
 * rest missing — a half-created term is worse than a failed one, because
 * nobody can tell by looking that it is incomplete.
 *
 * Same refusal reporting as upsertEvent, with one addition: RLS filters rows
 * out of the RETURNING clause individually, so "fewer rows came back than we
 * sent" is also a refusal, not a success.
 */
export async function insertEvents(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return []

  const { data, error } = await supabase.from('events').insert(rows).select()
  if (error) throw error
  if (!data || data.length !== rows.length) throw new Error(REFUSED_BATCH)
  return data
}

/**
 * Deletes one event by id. Resolves with nothing on success and throws when
 * the delete failed or removed nothing.
 */
export async function deleteEvent(id) {
  const { data, error } = await supabase.from('events').delete().eq('id', id).select()
  if (error) throw error
  if (!data || data.length === 0) throw new Error(REFUSED_DELETE)
}
