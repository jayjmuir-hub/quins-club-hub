import { supabase } from '../lib/supabase'

// Data access for public.access_requests — the approval gate in front of open
// signup. Same conventions as src/data/members.js: throws an Error rather than
// returning a {data, error} tuple, returns [] not null for empty lists, and
// takes ids explicitly rather than reaching for the session.
//
// WHY THIS TABLE EXISTS (the short version — the long one is in
// db/migrations/20260804_access_requests.sql): signup cannot simply be turned
// off, because invites are accepted behind RequireAuth and an invitee needs a
// session before they can accept. So the gate is approval. A signed-in account
// with no membership already reads zero rows from every table; what was
// missing was the admin's ability to triage the people sitting in that state.
//
// One row per profile, enforced by a UNIQUE key. That is the anti-spam
// mechanism, not housekeeping: a dismissed person has no update, delete or
// second-insert path, so they cannot re-open their own request. Every write
// below that sets 'dismissed' is an admin write, and RLS — not this module —
// is what enforces that.

/**
 * The caller's own request, or null when they have never made one.
 *
 * Null is a normal answer meaning "hasn't asked yet", and is what makes the
 * request form show. Takes the profile id explicitly, matching getMyProfile:
 * an ADMIN calling this unfiltered would get every row back, and
 * .maybeSingle() over many rows is an error rather than a lucky guess.
 */
export async function getMyAccessRequest(profileId) {
  if (!profileId) throw new Error('getMyAccessRequest needs a profile id.')

  const { data, error } = await supabase
    .from('access_requests')
    .select('id, profile_id, note, status, created_at, requested_role, requested_team_id')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

/**
 * Creates the caller's own request. `status` is deliberately NOT passed: the
 * column defaults to 'pending' and the INSERT policy's WITH CHECK pins it
 * there, so sending it from here would only create a value a client appears
 * to control.
 *
 * The note is optional — someone who types nothing still gets a request row,
 * because the row itself is the signal that a real person is waiting. It is
 * trimmed to null rather than stored as an empty string so the admin screen
 * can tell "said nothing" from "said something blank".
 */
export async function createAccessRequest({ profileId, note, role, teamId } = {}) {
  if (!profileId) throw new Error('createAccessRequest needs a profileId.')

  const trimmed = typeof note === 'string' ? note.trim() : ''

  const { data, error } = await supabase
    .from('access_requests')
    .insert({
      profile_id: profileId,
      note: trimmed || null,
      // ⚠️ REQUIRED SINCE 16 Aug 2026, AND THE INSERT POLICY IS WHAT REQUIRES
      // THEM. Jay: "i still have account requests coming in and have no idea who
      // they are because they don't type any extra info". Sending null here does
      // not produce a row with blanks — it is refused by
      // `access request insert own`, which is the point: the form is the
      // convenience and the policy is the gate.
      requested_role: role || null,
      requested_team_id: teamId || null,
    })
    .select()
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * The club's squads, for the access-request form's picker.
 *
 * ⚠️ AN RPC AND NOT A TABLE READ, AND THAT IS THE WHOLE REASON IT EXISTS. The
 * person filling this form in has no membership row, and every SELECT policy in
 * the schema bottoms out in one — so `from('teams').select()` returns an empty
 * list for them, not an error. A dropdown built on it would silently have no
 * options, which is exactly the failure the free-text note existed to avoid.
 *
 * `public.list_squads_for_access_request` is SECURITY DEFINER and returns three
 * columns. See db/migrations/20260816_access_request_role_and_squad.sql for why
 * it is a function rather than a wider policy on `teams`.
 *
 * Returns [] rather than throwing when the call fails: the form still has to be
 * submittable-looking while it loads, and the caller decides what an empty list
 * means on screen.
 */
export async function listSquadsForRequest() {
  const { data, error } = await supabase.rpc('list_squads_for_access_request')
  if (error) throw error
  return data ?? []
}

/**
 * Every request row the caller may read. An admin gets all of them; anyone
 * else gets their own, because RLS does the narrowing rather than this
 * function. Newest first, matching listPendingProfiles: the person who just
 * asked is the one being looked for.
 */
export async function listAccessRequests() {
  const { data, error } = await supabase
    .from('access_requests')
    .select(
      'id, profile_id, note, status, created_at, decided_at, decided_by,' +
        ' requested_role, requested_team_id',
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * Dismisses a person from the waiting list. UPSERT on profile_id rather than
 * update, because the two cases the admin faces look identical on screen but
 * differ underneath:
 *   - someone who ASKED   — has a row; it flips to 'dismissed'
 *   - a stranger who just signed in and never asked — has NO row; one is
 *     created already dismissed
 * Without the upsert the second case would be undismissable, which is the
 * larger half of the noise problem this whole feature exists to fix.
 */
export async function dismissAccessRequest({ profileId, decidedBy } = {}) {
  if (!profileId) throw new Error('dismissAccessRequest needs a profileId.')

  const { data, error } = await supabase
    .from('access_requests')
    .upsert(
      {
        profile_id: profileId,
        status: 'dismissed',
        decided_at: new Date().toISOString(),
        decided_by: decidedBy ?? null,
      },
      { onConflict: 'profile_id' },
    )
    .select()
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Un-dismisses someone: deletes the row outright rather than setting it back
 * to 'pending'.
 *
 * Deleting is the honest operation. A dismissal that is reversed did not turn
 * into a request the person made — restoring it as 'pending' would invent a
 * request they never sent, and would then be indistinguishable from one they
 * did. With the row gone they return to being exactly what they were before:
 * a signed-in account with no membership, visible in the waiting list, free
 * to ask properly if they want to.
 */
export async function restoreAccessRequest({ profileId } = {}) {
  if (!profileId) throw new Error('restoreAccessRequest needs a profileId.')

  const { error } = await supabase.from('access_requests').delete().eq('profile_id', profileId)

  if (error) throw error
}
