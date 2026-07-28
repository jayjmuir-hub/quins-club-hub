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

// A refused invite insert is not a thrown Supabase error — the "invites
// manage" RLS policy (ALL, USING+WITH CHECK is_admin(club_id)) simply matches
// zero rows for a non-admin caller, and PostgREST reports that as a
// successful empty response, the same silent-refusal shape upsertPlayer/
// upsertEvent already handle. This is a *reporting* mechanism, not access
// control: RLS is what actually decides, server-side.
const REFUSED_INVITE = "We couldn't send that invite. You may not have permission to invite members."

/**
 * Creates one invite row and returns it (including the database-generated
 * `token`, needed to build the accept link/URL for the admin to send
 * manually — there is no email-sending infrastructure in this build).
 *
 * The `token` column is never generated client-side: it is left out of the
 * insert entirely so its `gen_random_uuid()` default supplies it, then read
 * back via `.select().maybeSingle()` — the same insert-then-read-back shape
 * upsertPlayer/upsertEvent already use.
 *
 * teamId/playerId default to null (an admin invite has no team; most invites
 * have no linked player). The database's own check constraint
 * (`invites_team_required_unless_admin`) is the real enforcement of "a team
 * is required unless role is admin" — InviteForm validates this client-side
 * too, so a bad submission never reaches the database, but this function
 * does not re-check it: it is a thin query builder, like every other
 * function in this module.
 */
export async function createInvite({ clubId, email, role, teamId, playerId, createdBy }) {
  const { data, error } = await supabase
    .from('invites')
    .insert({
      club_id: clubId,
      email,
      role,
      team_id: teamId ?? null,
      player_id: playerId ?? null,
      created_by: createdBy,
    })
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_INVITE)
  return data
}

/**
 * Accepts an invite by token, via the `accept_invite` SECURITY DEFINER RPC —
 * the invitee never needs (and never gets) direct write access to
 * memberships. The RPC does its own validation server-side (token exists,
 * not already used, email matches the caller's own authenticated email) and
 * raises a Postgres exception with a friendly message on failure; that
 * surfaces here as a normal Supabase `{ data, error }` response, so this
 * follows the same throw-on-error convention as every other function in this
 * module rather than swallowing or rewording it.
 *
 * Returns the newly-created memberships row on success.
 */
export async function acceptInvite(token) {
  const { data, error } = await supabase.rpc('accept_invite', { _token: token })
  if (error) throw error
  return data
}
