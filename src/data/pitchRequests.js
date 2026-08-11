import { supabase } from '../lib/supabase'

// Pitch requests: a coach asks, an admin allocates.
//
// ⚠️ `events.pitch` IS THE ONLY SOURCE OF TRUTH FOR WHICH PITCH — Jay's
// ruling, 11 Aug 2026. This table records the CONVERSATION (who asked, what
// they said, who answered, when) and deliberately has NO pitch column of its
// own. A second place holding a pitch would disagree with the fixture the
// moment anybody edited the fixture directly, silently, and the fixture is
// what the schedule, the calendar feed and the clash detector all read.
//
// The cost, accepted knowingly: you cannot ask "what did Tracy allocate, and
// has it been changed since?" — only "was this answered?".
//
// ⚠️ A DECLINE IS INVISIBLE ON THE FIXTURE — also Jay's ruling. A declined
// request leaves `events.pitch` on `Pitch TBD`, which still reads as "not
// allocated yet"; the request list is the only place that knows it was asked
// and refused. So the request list is not a convenience, it is the ONLY route
// to that fact, which is why the submitter's own view is a requirement rather
// than a nicety and why the read policy carries `requested_by = auth.uid()`.

const REFUSED_CREATE =
  "We couldn't send that request. You may not be staff for this squad, or a request already exists."
const REFUSED_DECIDE =
  "We couldn't save that decision. Only an admin can answer a pitch request."

/** The statuses, in the order a request moves through them. */
export /**
 * The signed-in user's id, asked of the client library at write time.
 *
 * ⚠️ NOT TAKEN FROM A PROP OR A REACT CONTEXT, and that is deliberate twice
 * over. RLS checks `requested_by = auth.uid()` and `is_admin(...)` against the
 * token the request is actually sent with, so this is the only id that can be
 * right — a prop threaded down from a screen is a second copy that can be
 * stale or simply wrong. And requiring a context would mean every screen that
 * renders the event sheet has to provide one: EventDetail already shipped a
 * dead button once because a screen forgot to pass something.
 */
async function currentProfileId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const id = data?.user?.id
  if (!id) throw new Error('You need to be signed in to do that.')
  return id
}

/** The statuses, in the order a request moves through them. */
export const REQUEST_STATUSES = ['submitted', 'allocated', 'declined', 'cancelled']

export function isOpen(request) {
  return request?.status === 'submitted'
}

/**
 * Files a request against an existing fixture.
 *
 * ⚠️ `requested_by` IS SET HERE AND ENFORCED BY RLS. The insert policy checks
 * `requested_by = auth.uid()`, so passing somebody else's id fails rather than
 * quietly filing a request the read policy would then hide from its supposed
 * author.
 */
export async function requestPitch({ eventId, needsReferee = false, note = '' }) {
  const profileId = await currentProfileId()
  const { data, error } = await supabase
    .from('pitch_requests')
    .insert({
      event_id: eventId,
      requested_by: profileId,
      needs_referee: Boolean(needsReferee),
      note: note.trim() || null,
    })
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_CREATE)
  return data
}

/**
 * Every request the caller may see, newest first, joined to its fixture.
 *
 * ⚠️ ONE QUERY SERVES BOTH SCREENS, and that is deliberate rather than lazy.
 * RLS already decides what comes back — an admin sees the club's, a coach sees
 * their own — so two functions would differ only in a filter the DATABASE is
 * already applying, and the second one would be the one that drifted.
 */
export async function listPitchRequests({ status } = {}) {
  let query = supabase
    .from('pitch_requests')
    .select('*, events(id, team_id, type, title, opponent, starts_at, ends_at, pitch)')

  if (status) query = query.eq('status', status)

  const { data, error } = await query.order('requested_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Allocates a pitch: writes the fixture, then closes the request.
 *
 * ⚠️ THE FIXTURE IS WRITTEN FIRST, AND THE ORDER IS THE POINT. If the request
 * were closed first and the fixture write then failed, the queue would say
 * "allocated" while the fixture still said `Pitch TBD` — the coach is told
 * they have a pitch and the schedule disagrees. This way round, a failure
 * leaves the request OPEN and the fixture correct, which is a job still to do
 * rather than a lie.
 *
 * ⚠️ NOT ATOMIC, and there is no transaction available over PostgREST. The
 * order above is the mitigation, not a fix. If this ever needs to be atomic it
 * is an RPC, in the same shape as set_series_time_from.
 */
export async function allocatePitch({ requestId, eventId, pitch }) {
  const decidedBy = await currentProfileId()
  const { data: event, error: eventError } = await supabase
    .from('events')
    .update({ pitch })
    .eq('id', eventId)
    .select()
    .maybeSingle()

  if (eventError) throw eventError
  if (!event) throw new Error(REFUSED_DECIDE)

  const { data, error } = await supabase
    .from('pitch_requests')
    .update({ status: 'allocated', decided_by: decidedBy, decided_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_DECIDE)
  return data
}

/**
 * Declines a request.
 *
 * ⚠️ TOUCHES THE FIXTURE NOT AT ALL. Jay's ruling: a decline is visible only
 * in the request list. The fixture keeps `Pitch TBD`, which still reads as
 * "not allocated yet" — the same words for a different situation, and that is
 * the accepted cost of not inventing a fixture state nobody asked for.
 *
 * The note is what makes the decline useful, so it is required by the screen
 * rather than optional: "declined" with no reason is a coach with nothing to
 * act on.
 */
export async function declinePitch({ requestId, reason }) {
  const decidedBy = await currentProfileId()
  const { data, error } = await supabase
    .from('pitch_requests')
    .update({
      status: 'declined',
      decision_note: reason?.trim() || null,
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_DECIDE)
  return data
}

/**
 * Withdraws an UNDECIDED request.
 *
 * ⚠️ A DELETE, NOT A STATUS WRITE, because the UPDATE policy is admin-only —
 * widening it to the requester would also let them write 'allocated'. The
 * DELETE policy carries `status = 'submitted'`, so this silently affects zero
 * rows once Tracy has answered, which is why the zero-row check below treats
 * that as a refusal rather than success.
 */
export async function withdrawRequest(requestId) {
  const { data, error } = await supabase
    .from('pitch_requests')
    .delete()
    .eq('id', requestId)
    .select()

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error("That request has already been answered, so it can't be withdrawn.")
  }
  return data[0]
}
