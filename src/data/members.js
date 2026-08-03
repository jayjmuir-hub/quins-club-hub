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
 * The profiles embed selects full_name AND email. Both of those are new-ish
 * facts about the schema, verified against the live database rather than
 * assumed:
 *   - profiles.email exists (migration `profiles_email_and_admin_access`,
 *     2026-08-03) as a mirror of auth.users.email, kept in sync by triggers.
 *     auth.users itself is unreachable from the browser by design, so the
 *     mirrored column is the only way the client can show a member's login.
 *     It is READ-ONLY here: writing it would desync the address people
 *     actually sign in with.
 *   - Until that same migration, profiles RLS was own-row only, so this embed
 *     silently returned null for every member except the caller and
 *     Admin.jsx's `?? 'Unnamed member'` fallback disguised it. The new
 *     `profile read club admin` policy (SELECT, using
 *     private.shares_admin_club(id)) is what makes the embed actually
 *     populate for an admin.
 *
 * A non-admin calling this legitimately gets back only their own row(s) —
 * RLS does the narrowing, not this function — so it is safe to call from
 * any signed-in context, but Admin.jsx only does so once isAdmin() is true.
 */
export async function listClubMembers() {
  const { data, error } = await supabase.from('memberships').select('*, profiles(full_name, email), teams(name)')
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

// Same silent-refusal mechanism as REFUSED_INVITE above, against the two
// tables the Accounts screen writes to. The `memb manage` policy on
// memberships (ALL, USING+WITH CHECK private.is_admin(club_id)) and
// `profile update club admin` on profiles (UPDATE, USING+WITH CHECK
// private.shares_admin_club(id)) are the real enforcement, server-side; a
// caller who fails either gets a successful zero-row response, not an error,
// so every writer below reads its row back and treats "no row" as a refusal.
//
// The two messages are deliberately distinct: an access change and a name
// change are separate tables behind separate policies, and the Accounts
// screen may do one without the other.
const REFUSED_MEMBERSHIP =
  "We couldn't change that member's access. You may not have permission to manage members."
const REFUSED_MEMBERSHIP_DELETE =
  "We couldn't remove that member's access. You may not have permission to manage members."
const REFUSED_PROFILE =
  "We couldn't save that name. You may not have permission to change this member's details."

// Mirrors the memberships_role_check constraint on the live table
// (role IN admin/coach/parent/player), verified directly rather than assumed.
const ROLES = ['admin', 'coach', 'parent', 'player']

/**
 * Changes one membership's role and/or team, returning the updated row.
 *
 * This function is NOT the thin query builder the rest of this module is, and
 * that is deliberate. `invites` has a database check constraint
 * (`invites_team_required_unless_admin`) enforcing "a team is required unless
 * the role is admin"; `memberships` has NO equivalent constraint — its only
 * constraints are the primary key, the four foreign keys, and the role check.
 * So the rule is enforced here, in JavaScript, or it is not enforced at all.
 * A coach row with a null team_id scopes to nothing and renders as an account
 * that can see no age group; an admin row carrying a team_id is a
 * contradiction scope.js would read as club-wide anyway.
 *
 * The two halves of the rule are handled differently, on purpose:
 *   - role 'admin' → team_id is written as null, whatever was passed. The
 *     caller is usually a form whose team dropdown still holds the previous
 *     selection at the moment the role changes to admin; throwing there would
 *     make "promote someone to admin" fail for a reason the user cannot see.
 *     Coercing to the single valid value cannot corrupt anything.
 *   - any other role → a null/absent teamId throws before the network call.
 *     There is no safe value to coerce to, and writing null would quietly
 *     strand the account.
 */
export async function updateMembershipRole({ membershipId, role, teamId } = {}) {
  if (!membershipId) throw new Error('updateMembershipRole needs a membershipId.')
  if (!ROLES.includes(role)) {
    throw new Error(`updateMembershipRole needs a role of ${ROLES.join(', ')}.`)
  }

  const isAdminRole = role === 'admin'
  if (!isAdminRole && !teamId) {
    throw new Error('Choose an age group for this role.')
  }

  const { data, error } = await supabase
    .from('memberships')
    .update({ role, team_id: isAdminRole ? null : teamId })
    .eq('id', membershipId)
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_MEMBERSHIP)
  return data
}

/**
 * Deletes one membership row — "revoke access" on the Accounts screen.
 * Resolves with nothing on success and throws when the delete failed or
 * removed nothing (the RLS-refusal case).
 *
 * Only the membership goes: the profile and the auth user are untouched, so
 * the person keeps their login and simply has no role in the club until they
 * are invited again. Deleting an auth user needs the service-role key, which
 * never touches this frontend.
 *
 * There is no "is this the last admin?" check here. That guard needs the full
 * membership list and the caller's own identity, neither of which this
 * function has; it belongs in the screen (see the plan's Task 4), where a
 * refusal can be shown before anything is attempted.
 */
export async function deleteMembership(membershipId) {
  if (!membershipId) throw new Error('deleteMembership needs a membershipId.')

  const { data, error } = await supabase
    .from('memberships')
    .delete()
    .eq('id', membershipId)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error(REFUSED_MEMBERSHIP_DELETE)
}

/**
 * Updates one profile's display name and returns the updated row.
 *
 * Writes profiles, not memberships: one person with several membership rows
 * (memberships has no unique constraint on (profile_id, club_id, role), so
 * duplicates are legitimate) has exactly one name, and this changes it
 * everywhere at once.
 *
 * A blank name is refused rather than written. Admin.jsx renders
 * `profiles?.full_name ?? 'Unnamed member'` — a null falls back, but an empty
 * string does not, so saving one would produce a nameless row that looks like
 * a rendering bug and can only be fixed by editing it again.
 */
export async function updateProfileName({ profileId, fullName } = {}) {
  if (!profileId) throw new Error('updateProfileName needs a profileId.')

  const trimmed = typeof fullName === 'string' ? fullName.trim() : ''
  if (!trimmed) throw new Error('Enter a name.')

  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: trimmed })
    .eq('id', profileId)
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_PROFILE)
  return data
}
