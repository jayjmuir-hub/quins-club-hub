import { supabase } from '../lib/supabase'
import { upsertById } from './upsertById.js'
import { fetchAllPages } from './limits.js'

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

  // ⚠️ PAGED, NOT CAPPED, SINCE 10 Aug 2026. This used to be a single capped
  // request that THREW above 900 rows. That refusal was right in principle —
  // a short list that looks complete is worse than an error — but for an admin
  // viewing all fifteen squads it was simply a broken screen: ~1,690 rows over
  // the default 18-month window, and no action available short of filtering to
  // one squad. Paging keeps the guarantee (everything, or a throw — never
  // some) and removes the wall. See fetchAllPages in ./limits.js.
  //
  // ⚠️ A FRESH BUILDER PER PAGE. A PostgREST query builder is single-use once
  // awaited; handing the same one back would re-send page one forever.
  // ⚠️ THE LEAGUE TEAM IS EMBEDDED, NOT FETCHED PER SCREEN, and that is a
  // deliberate choice about where the join lives. Schedule, the Dashboard, the
  // allocation grid and EventDetail all render fixtureLabel(); giving each its
  // own league_teams query would be four more round trips, four more loading
  // states, and four chances for one screen to render a label while another
  // renders a bare squad name. PostgREST resolves it through the real foreign
  // key, so a fixture with a null league_team_id embeds null — which is
  // exactly what fixtureLabel treats as "not a league match".
  //
  // ⚠️ NOT `select('*')` ANY MORE, so nothing may assume the row shape is only
  // columns. Every write path builds its payload from named fields (see
  // EventForm's `common`), so no writer round-trips this object back.
  const buildQuery = () => {
    let query = supabase
      .from('events')
      .select('*, league_team:league_teams(id, rcm_name, division)')
    if (Array.isArray(teamIds) && teamIds.length > 0) {
      query = query.in('team_id', teamIds)
    }
    if (from) query = query.gte('starts_at', from)
    if (to) query = query.lte('starts_at', to)
    return query
  }

  // ⚠️ `id` IS THE TIEBREAK AND IT IS LOAD-BEARING, NOT TIDINESS. `.range()`
  // is OFFSET/LIMIT, and two events can share a `starts_at` — a Saturday of
  // age-group matches all kicking off at 09:00 is the normal case, not an edge
  // one. With `starts_at` alone the sort is under-specified, so Postgres may
  // order those rows differently between two requests and paging would return
  // one twice and drop another, with no error anywhere.
  return fetchAllPages(
    buildQuery,
    [
      ['starts_at', { ascending: true }],
      ['id', { ascending: true }],
    ],
    'events',
    'Narrow the date range or filter to one squad.',
  )
}

/**
 * One event by id, with its squad and league team embedded.
 *
 * ⚠️ THE SAME EMBED AS listEvents, DELIBERATELY. The match sheet renders
 * fixtureLabel() off this row exactly as Schedule does off a listed one, and
 * two different shapes for "an event" is how one screen ends up rendering a
 * league identity that another cannot. `teams` is embedded too because the
 * sheet needs the squad NAME for the deadline rule, and a second query for one
 * string is a second thing that can fail.
 *
 * Returns null for a missing or unreadable event rather than throwing — RLS
 * hides another club's fixture as "not found", which is the correct answer to
 * show and not an error state.
 */
export async function getEvent(id) {
  if (!id) return null

  const { data, error } = await supabase
    .from('events')
    // ⚠️ `scoring_kinds` IS LOAD-BEARING AND EASY TO LOSE. scoringForTeam() reads
    // the squad's override off this embed and falls back to the age band when it
    // is absent — so dropping the column from this select does not break, it
    // silently ignores the club's own scoring choice and offers a coach the wrong
    // set of boxes. The embed is a column list rather than `*` on purpose (see
    // above); that is precisely the shape that loses a column by omission.
    .select(
      '*, league_team:league_teams(id, rcm_name, division), team:teams(id, name, sort_order, scoring_kinds)',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

// Suffixed so concurrent subscriptions (e.g. dashboard + schedule screens
// both mounted) get distinct realtime channel topics rather than colliding.
let channelSeq = 0

/**
 * How long to wait for the changes to stop arriving before re-reading.
 *
 * ⚠️ THE CALLBACK IS A FULL REFETCH OF THE CALLER'S WHOLE SCHEDULE, so a coach
 * saving three fixtures in a row would otherwise cost every connected client
 * three of them. 400ms is long enough to collapse a burst of saves and short
 * enough that nobody perceives it as lag on a single change.
 */
export const REALTIME_DEBOUNCE_MS = 400

/**
 * Subscribes to realtime changes on the events table. Returns an unsubscribe
 * function — call it from a useEffect cleanup. Safe to call more than once.
 *
 * ⚠️ THIS DID NOTHING AT ALL UNTIL 13 Aug 2026, and the code was never the
 * reason. `public.events` was not in the `supabase_realtime` publication, so
 * Postgres emitted no changes and this socket sat open receiving nothing. Two
 * features silently did not work. See
 * db/migrations/20260813_realtime_publication_events.sql — and note that if
 * that publication is ever emptied again, everything here goes quiet with no
 * error anywhere.
 *
 * ⚠️ NO `filter` IS PASSED, DELIBERATELY, AND THE OBVIOUS "FIX" IS A BUG.
 * Adding `filter: team_id=in.(...)` looks like an optimisation and breaks
 * deletes: `events` is replica identity DEFAULT, so a DELETE payload carries
 * the primary key only, `team_id` is absent, the filter matches nothing, and a
 * cancelled fixture stops disappearing from other people's screens. RLS
 * (`event read` → `is_attached_to_team`) already scopes delivery per
 * subscriber, so a filter would buy nothing and cost that. Contrast
 * subscribeAvailability, which DOES filter — on `event_id`, and therefore has
 * the same latent delete gap; see the migration.
 *
 * ⚠️ THE PAYLOAD IS DELIBERATELY NOT PASSED ON. Callers get "something
 * changed, re-read" and nothing else — which is both what they already did and
 * the only thing that stays correct once changes are coalesced, since a
 * debounced burst has no single meaningful payload. The re-read is itself
 * RLS-scoped, so a delete arriving as a bare id is enough.
 *
 * @param callback   invoked with NO arguments, at most once per debounce window
 * @param debounceMs injectable purely so tests need not wait in real time
 */
export function subscribeEvents(callback, { debounceMs = REALTIME_DEBOUNCE_MS } = {}) {
  let timer = null

  function onChange() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      callback()
    }, debounceMs)
  }

  const channel = supabase
    .channel(`events-changes-${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, onChange)
    .subscribe()

  let unsubscribed = false
  return () => {
    if (unsubscribed) return
    unsubscribed = true
    // ⚠️ CANCEL THE PENDING FIRE. Without this a change arriving just before a
    // screen unmounts calls back afterwards, and the callback is a setState —
    // so an unmounted Schedule would try to refetch and store into a component
    // that is gone.
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
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
  return upsertById('events', event, { refusedMessage: REFUSED })
}

/**
 * Sets one event's per-event availability override ('auto' | 'open' | 'locked').
 * A targeted UPDATE of just that column — the Availability sheet flips it live
 * without re-sending the whole event. RLS (the events write policy) is the gate:
 * only staff who can_edit_team may change it, so a refused write comes back as no
 * row and is reported as REFUSED, matching upsertEvent.
 */
export async function setAvailabilityOverride(eventId, value) {
  if (!eventId) throw new Error('setAvailabilityOverride needs an event id.')

  const { data, error } = await supabase
    .from('events')
    .update({ availability_override: value })
    .eq('id', eventId)
    .select()
    .maybeSingle()

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

// --- Deleting a repeating series --------------------------------------
//
// FUTURE OCCURRENCES ONLY — Jay's ruling, 8 Aug 2026. "Delete the series"
// means this occurrence and every LATER one; the ones already played stay,
// because they carry results and availability history that nobody asked to
// throw away. A coach cancelling the rest of a term does not mean "erase
// the eight sessions the squad already turned up to".
//
// The filter is therefore `series_id = x AND starts_at >= the chosen
// occurrence's start`. It is a >= and not a >, so the occurrence the coach
// is looking at goes too — which is what "this and all later sessions" says
// on the button.
//
// ⚠️ SCOPE: series_id ONLY. group_id (the multi-squad fan-out) is
// deliberately NOT handled here — Jay deferred it on 8 Aug 2026. Deleting
// across squads is a different question with a different blast radius (one
// squad's coach reaching into another squad's fixtures, where RLS really
// would make the delete genuinely partial rather than all-or-nothing). Do
// not quietly widen this to group_id.

/**
 * How many events a deleteSeriesFrom(seriesId, fromStartsAt) is about to
 * try to remove, so the confirm step can name the number BEFORE anything
 * happens.
 *
 * ⚠️ THIS IS A READ AND THE DELETE IS A WRITE, AND THE TWO ARE GOVERNED BY
 * DIFFERENT POLICIES — reading events is can_see_team, changing them is
 * can_edit_team. So this count is an upper bound on what the delete can
 * achieve, never a promise. That is exactly why deleteSeriesFrom hands its
 * rows back and the caller compares the two; see the note there.
 *
 * head: true, so this is a COUNT and not a download of the rows.
 */
export async function countSeriesFrom(seriesId, fromStartsAt) {
  if (!seriesId || !fromStartsAt) return 0

  const { count, error } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('series_id', seriesId)
    .gte('starts_at', fromStartsAt)

  if (error) throw error
  return count ?? 0
}

/**
 * Deletes the occurrence starting at `fromStartsAt` and every later one in
 * the same series. Returns THE ROWS ACTUALLY DELETED — the caller needs the
 * count, not a boolean.
 *
 * ⚠️ A PARTIAL DELETE LOOKS EXACTLY LIKE A SUCCESSFUL ONE. RLS does not
 * raise on a row it will not let you touch; it filters that row out of the
 * statement, and PostgREST returns 200 with whatever survived. Ten asked
 * for, three deleted, no error anywhere. This codebase has already been
 * bitten by precisely that shape once — the silent anon downgrade the
 * session guard in src/lib/supabase.js exists to catch, where a signed-in
 * request quietly became an anon one and the affected statements came back
 * as perfectly successful zero-row responses (proved live on production
 * 6 Aug 2026, both HTTP 200, no error body either way). The lesson recorded
 * there is the one applied here: **a write that reports no error has not
 * thereby reported success — count the rows.**
 *
 * A series is single-squad, so all-or-nothing is what SHOULD happen. This
 * function refuses to assume it. It hands the rows back and EventDetail
 * compares that count against the number it put on the button, saying so
 * plainly when they disagree rather than closing the sheet on a job half
 * done.
 *
 * Zero rows back is a flat refusal and throws, same as deleteEvent.
 */
export async function deleteSeriesFrom(seriesId, fromStartsAt) {
  const { data, error } = await supabase
    .from('events')
    .delete()
    .eq('series_id', seriesId)
    .gte('starts_at', fromStartsAt)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error(REFUSED_DELETE)
  return data
}

// --- Editing a repeating series ----------------------------------------
//
// Same ruling as the delete above and the same reasons: FUTURE ONLY
// (`starts_at >=`, so the occurrence being edited moves too), series_id only,
// and count the rows rather than trusting a missing error.
//
// ⚠️ THE FIELD LIST IS THE WHOLE DESIGN. These are the columns whose value is
// the SAME on every occurrence, so one UPDATE can set them. Everything else is
// excluded on purpose:
//
//   starts_at / ends_at   per occurrence — each row has its own DATE. One
//                         value across a series would collapse a term onto a
//                         single day. Time-of-day goes through
//                         setSeriesTimeFrom below, which is why it exists.
//   result_us/them        a score belongs to one match and nothing else.
//   team_id               moving a series between squads changes who can see
//                         and edit it. A different question, not answered here.
//   series_id / group_id  the identity being filtered on.
//
// ⚠️ ADDING A COLUMN TO `events` DOES NOT ADD IT HERE, deliberately. A new
// column is opted IN to series-wide editing, never defaulted in, because the
// cost of getting it wrong is rewriting a term's worth of rows.
export const SERIES_EDITABLE_FIELDS = [
  'type',
  'title',
  'opponent',
  'home',
  'venue',
  'competition',
  'pitch',
  'notes',
]

/**
 * Applies the date-independent fields of `patch` to the occurrence starting at
 * `fromStartsAt` and every later one in the same series.
 *
 * Returns THE ROWS ACTUALLY UPDATED, for the reason deleteSeriesFrom returns
 * its rows: RLS does not raise on a row it will not let you touch — it filters
 * that row out of the statement and PostgREST answers 200 with whatever
 * survived. Ten asked for, three written, no error anywhere.
 *
 * Zero rows back is a flat refusal and throws.
 */
export async function updateSeriesFrom(seriesId, fromStartsAt, patch) {
  const fields = Object.fromEntries(
    Object.entries(patch ?? {}).filter(([key]) => SERIES_EDITABLE_FIELDS.includes(key)),
  )
  // Nothing series-wide to write is not an error: the caller may be changing
  // only the time, which setSeriesTimeFrom handles.
  if (Object.keys(fields).length === 0) return []

  const { data, error } = await supabase
    .from('events')
    .update(fields)
    .eq('series_id', seriesId)
    .gte('starts_at', fromStartsAt)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error(REFUSED)
  return data
}

/**
 * Moves the TIME OF DAY of this occurrence and every later one in the series,
 * keeping each occurrence's own date and its duration.
 *
 * ⚠️ AN RPC BECAUSE IT CANNOT BE ONE POSTGREST UPDATE. Every other series-wide
 * field takes the same value on every row; the time does not — each
 * occurrence's new `starts_at` is computed from ITS OWN date. Doing that
 * client-side would be N round trips and non-atomic, leaving half a term at
 * the old time with nothing on screen saying which half.
 *
 * `public.set_series_time_from` is SECURITY INVOKER, so `event edit`
 * (private.can_edit_team) filters the UPDATE exactly as it filters this one.
 * The function grants nothing.
 *
 * Hours and minutes are CLUB wall-clock (Asia/Dubai), matching the form's time
 * input — not the reader's zone and not UTC.
 */
export async function setSeriesTimeFrom(seriesId, fromStartsAt, hours, minutes) {
  const { data, error } = await supabase.rpc('set_series_time_from', {
    _series: seriesId,
    _from: fromStartsAt,
    _hh: hours,
    _mm: minutes,
  })

  if (error) throw error
  if (!data || data.length === 0) throw new Error(REFUSED)
  return data
}
