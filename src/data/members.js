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
 * The players embed is the linked player a parent/player membership points at
 * (memberships.player_id). It is what the Accounts screen's "Linked player"
 * column shows; without it the column could only render a raw uuid. Two facts
 * about it, both verified against the live schema rather than assumed:
 *   - players.full_name exists and is NOT NULL, so a joined row always has a
 *     name — a missing name means a missing LINK (player_id null), which is
 *     normal and expected for admin and coach rows.
 *   - memberships.player_id is the ONLY foreign key from memberships to
 *     players (`memberships_player_id_fkey`), so `players(full_name)` is
 *     unambiguous to PostgREST and needs no explicit !fkey hint.
 *
 * A non-admin calling this legitimately gets back only their own row(s) —
 * RLS does the narrowing, not this function — so it is safe to call from
 * any signed-in context, but Admin.jsx only does so once isAdmin() is true.
 */
export async function listClubMembers() {
  const { data, error } = await supabase
    .from('memberships')
    .select('*, profiles(full_name, email), teams(name), players(full_name)')
  if (error) throw error
  return data ?? []
}

/**
 * Lists every profile row the caller is allowed to read.
 *
 * READ THE NAME WITH SUSPICION: this does NOT return only pending profiles,
 * and it cannot. There is no server-side "has no membership" filter available
 * through PostgREST here — the not-exists lives inside
 * `private.can_admin_see_pending()`, a SECURITY DEFINER predicate behind the
 * `profile read pending` SELECT policy, which decides *visibility* but is not
 * something the client can also select on. So what comes back for an admin is
 * the union of the three profiles policies:
 *   - `profile read own`        — their own row
 *   - `profile read club admin` — everyone with a membership in their club
 *   - `profile read pending`    — everyone, anywhere, with ZERO memberships
 * The unattached signups are the third group, and the only way to isolate
 * them client-side is to subtract the profile_ids already present in
 * listClubMembers() (plus, if you care, the caller's own id — an admin is in
 * the second group, so they are already subtracted by that same step).
 *
 * That subtraction is deliberately NOT done here: this stays a thin data
 * accessor like every other function in this module, and the caller already
 * has the members list it needs to diff against. src/screens/Accounts.jsx is
 * where it happens.
 *
 * A non-admin gets back exactly one row — their own — because the other two
 * policies evaluate false for them. RLS does the narrowing, not this
 * function.
 *
 * Ordered newest-first: for the "Waiting for access" list, the person who
 * just signed up and is standing there waiting is the one being looked for.
 */
export async function listPendingProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Reads one profile row by id, or null when there isn't one.
 *
 * Takes the id explicitly rather than reaching for the session, matching
 * createInvite's `createdBy` — screens already hold `user` from useAuth. It
 * is NOT optional: with `profile read club admin` and `profile read pending`
 * in play an admin's unfiltered profiles select returns many rows, and
 * .maybeSingle() over many rows is an error, not a lucky guess. So a missing
 * id throws here rather than issuing that query.
 *
 * Null is a normal answer, not a failure: the profiles row is created by the
 * `on_auth_user_created` trigger, so immediately after a first magic-link
 * sign-in the session can exist a moment before the row does. Callers should
 * treat null as "not known yet" and re-read, never as "this user has no
 * profile".
 */
export async function getMyProfile(userId) {
  if (!userId) throw new Error('getMyProfile needs a user id.')

  // first_name/last_name/name_confirmed_at are what the sign-in name gate
  // reads. name_confirmed_at is the one that decides whether the gate opens:
  // a populated first_name proves only that a name ARRIVED (Google supplies
  // one, and the profiles_sync_name trigger splits it on insert), never that
  // the person agreed with it.
  const { data, error } = await supabase
    .from('profiles')
    // `phone` was added to public.profiles on 8 Aug 2026 so that a member with
    // no linked player has at least one fact about themselves they can record.
    // Selected HERE rather than by a second query because useMyProfile already
    // caches this row per user id — /more reads the phone straight out of that
    // cache, at the cost of one more column on a row it was fetching anyway.
    .select('id, full_name, first_name, last_name, name_confirmed_at, email, phone, created_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

// A refused invite insert is not a thrown Supabase error — the "invites
// manage" RLS policy (ALL, USING+WITH CHECK is_admin(club_id)) simply matches
// zero rows for a non-admin caller, and PostgREST reports that as a
// successful empty response, the same silent-refusal shape upsertPlayer/
// upsertEvent already handle. This is a *reporting* mechanism, not access
// control: RLS is what actually decides, server-side.
const REFUSED_INVITE = "We couldn't send that invite. You may not have permission to invite members."
// Separate message for the second write (invite_targets), because it fails
// for its own reason behind its own policy (`invite targets manage`, FOR ALL,
// admin of the invite's club) — and because by the time it fires the invite
// row has already been created and then rolled back by hand, which is worth
// wording honestly rather than folding into REFUSED_INVITE.
const REFUSED_INVITE_TARGETS =
  "We couldn't save the age groups for that invite, so no invite was sent. You may not have permission to invite members."
// Refused before the insert rather than after acceptance: `accept_invite`
// raises "This invite is incomplete — it has no age group" for exactly this
// shape, but by then the link has been sent and the person who has to deal
// with the failure is the invitee, who can do nothing about it.
const INCOMPLETE_INVITE =
  "That invite has no age group, so it wouldn't give anyone access. Choose an age group first."

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
 * have no linked player). Those two columns are the LEGACY single-target path
 * and still work: `accept_invite` falls back to them when an invite has no
 * `invite_targets` rows, so a caller that passes only teamId/playerId behaves
 * exactly as it did before.
 *
 * `targets` is the multi-target path: an array of `{ teamId, playerId }`
 * pairs, one per access row the invitee should end up with (a parent of two
 * children in different age groups is two targets). Each becomes one
 * `invite_targets` row and, on acceptance, one membership. An admin-role
 * invite has no targets. Pairs, not two parallel arrays, because the data
 * genuinely is pairs — child A in U10, child B in U14.
 *
 * Two rules ARE enforced here, before any network call:
 *   - "a team is required unless the role is admin". This used to be a
 *     database check constraint (`invites_team_required_unless_admin`), now
 *     DROPPED; `accept_invite` raises on it instead — but only at ACCEPT
 *     time, which means an admin can otherwise create a link that looks
 *     perfectly fine and fails in the invitee's face days later. InviteForm
 *     refuses it too, and does so with a better message because it knows
 *     which control is empty; this is the backstop for every other caller,
 *     because the cost of a bad invite is paid by someone who cannot fix it.
 *   - a target with no teamId IS refused, because
 *     `invite_targets.team_id` is NOT NULL — sending one is a guaranteed
 *     server-side failure, and catching it up front is what keeps the
 *     half-built-invite cleanup below from ever being needed for a bug the
 *     caller could see coming.
 */
export async function createInvite({
  clubId,
  email,
  role,
  teamId,
  playerId,
  createdBy,
  targets = [],
} = {}) {
  const targetList = Array.isArray(targets) ? targets : []
  // Validated before the invite row exists, so an obviously-bad target can
  // never leave one behind to clean up.
  for (const target of targetList) {
    if (!target?.teamId) throw new Error('Choose an age group for each person on this invite.')
  }
  if (role !== 'admin' && targetList.length === 0 && !teamId) {
    throw new Error(INCOMPLETE_INVITE)
  }

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

  // No targets is the legacy shape, and it must stay a single round trip:
  // `accept_invite` falls back to the invite's own team_id/player_id when
  // invite_targets is empty, so there is nothing to write and nothing to
  // clean up.
  if (targetList.length === 0) return data

  const { data: savedTargets, error: targetsError } = await supabase
    .from('invite_targets')
    .insert(
      targetList.map((target) => ({
        invite_id: data.id,
        team_id: target.teamId,
        player_id: target.playerId ?? null,
      })),
    )
    .select()

  if (targetsError || !savedTargets || savedTargets.length === 0) {
    // These are two statements, not a transaction — PostgREST gives the
    // browser no way to wrap them in one. If the second fails we are left
    // with a targetless invite, and a targetless invite is NOT inert: it
    // takes the legacy fallback path, so accepting it would grant the
    // invite's own team_id/player_id — for a multi-target parent that is
    // usually null, i.e. an access row scoped to nothing, or worse, silently
    // the wrong single age group. Leaving it and reporting an error would
    // hand the invitee a link that "works" and grants the wrong thing.
    //
    // So the invite row is deleted and the whole operation reported as
    // failed: the admin retries and gets one correct invite. The delete is
    // best-effort — if it too is refused, the original failure is still what
    // the admin needs to see, and a *targetless* invite is at least visible
    // in the invites list rather than being a wrong-access one nobody knows
    // about. (Deleting the invite cascades to any invite_targets rows that
    // did land, via invite_targets.invite_id ON DELETE CASCADE.)
    try {
      await supabase.from('invites').delete().eq('id', data.id)
    } catch {
      // Swallowed deliberately: the error below is the useful one.
    }
    if (targetsError) throw targetsError
    throw new Error(REFUSED_INVITE_TARGETS)
  }

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
 * Returns an ARRAY of the newly-created memberships rows on success — the
 * RPC's return type is `SETOF memberships`, not a single row, because one
 * invite can carry several targets (a parent of two children in different age
 * groups) and each target becomes its own membership. An invite with no
 * `invite_targets` rows still takes the legacy fallback and comes back as a
 * one-element array. Callers must not treat the result as a single object.
 */
export async function acceptInvite(token) {
  const { data, error } = await supabase.rpc('accept_invite', { _token: token })
  if (error) throw error
  return data
}

/**
 * Claims the squads the roster already lists this person against, via the
 * `claim_roster_access` SECURITY DEFINER RPC.
 *
 * This is how PARENTS get access. It replaces the emailed invite for them
 * entirely; `createInvite`/`acceptInvite` above stay in service for staff,
 * whose roles cannot be derived from roster data.
 *
 * Takes NO arguments, and that is the security property, not an omission. The
 * RPC reads the caller's email from `auth.users` server-side. An email
 * parameter would let any signed-in person claim any family's access by typing
 * their address — the roster is not a secret.
 *
 * Returns an ARRAY of the memberships created, exactly like `acceptInvite`: a
 * parent of two children in different age groups gets two rows. An EMPTY array
 * is a completely normal answer and means one of two things, which the caller
 * cannot distinguish and should not try to:
 *   - the signed-in address is not on the roster, or
 *   - this account already holds access, so the RPC declined to touch it
 *     (it only ever runs for an account with zero memberships, so that revoked
 *     access is never silently resurrected).
 *
 * Safe to call more than once: the second call returns [] rather than
 * duplicating anything, guarded both by that zero-membership check and by the
 * `memberships_unique_grant` index underneath it.
 */
export async function claimRosterAccess() {
  const { data, error } = await supabase.rpc('claim_roster_access')
  if (error) throw error
  return data ?? []
}

// ── register_my_player: the RPC's error codes, turned into sentences ───────
//
// ⚠️ KEYED ON `error.code`, NEVER ON THE MESSAGE TEXT. The Postgres messages
// are perfectly usable English (they were written to be), but matching on
// prose means a reworded RAISE in a future migration silently drops every
// caller into the generic fallback — and nothing fails, so nobody finds out.
// The codes are part of the function's contract; see the `using errcode =`
// lines in db/migrations/20260808_register_my_player.sql.
//
// Each code covers more than one raise, so the wording below has to be true
// of every raise that carries it:
//
//   42501  three raises: not signed in / no email on the account / email not
//          confirmed. The first is unreachable from this app — RequireAuth
//          guarantees a session before any screen calling this can render —
//          and the second cannot happen for a password signup, so in practice
//          this is ALWAYS the unconfirmed-email case. The sentence leads with
//          that and stays true of the other two.
//   22023  three raises: blank name, name over 80 characters, unknown team.
//          The first two are also checked in the form before it submits, so
//          reaching here usually means the age-group list the browser is
//          holding no longer matches the database.
//   42901  one raise: five pending registrations already. This is the one a
//          parent is most likely to hit by accident (a double submit that did
//          not look like it worked), so it says what to do rather than just
//          refusing.
//   22004  one raise, added 9 Aug 2026: a blank gender on a single-gender
//          squad. ⚠️ DELIBERATELY ABSENT FROM THE MAP BELOW — see the note
//          there. It gets its own code for exactly that reason.
const REGISTER_MESSAGES = {
  42501:
    'Please confirm your email address before adding a player. Check your inbox for the ' +
    'confirmation link from when you signed up, then try again.',
  22023:
    "We couldn't use those details. Check the player's name is filled in and no longer than " +
    '80 characters, and pick an age group from the list. If the list looks out of date, ' +
    'reload the page.',
  42901:
    "You already have players waiting to be approved, so we haven't added another. " +
    'The club will review them — please wait rather than adding more.',
  // ⚠️ NO 22004 ENTRY, AND THE ABSENCE IS THE POINT. The gender-required guard
  // raises 22004 rather than joining the three raises under 22023 precisely so
  // that its server message — which NAMES THE SQUAD ("U16G Contact is a
  // single-gender squad, so…") — falls through to `error.message` below and
  // reaches the parent intact. An entry here would replace it with a generic
  // sentence and throw away the only part that explains why a field they
  // ignored a moment ago suddenly matters. If you add one, delete the distinct
  // errcode in the migration too, because it would no longer be doing anything.
}

const REGISTER_FALLBACK = "We couldn't add that player. Try again in a moment."

/**
 * Registers the caller's own player and returns the new PENDING membership row.
 *
 * This is the self-registration path (spec:
 * claude/decisions/2026-08-08-parent-self-registration.md). It wraps
 * `public.register_my_player`, a SECURITY DEFINER function, because a parent
 * has no INSERT rights on `players` and must not be given any — RLS grants
 * rows, not columns, so an owner-insert policy on players would hand them
 * `team_id`, the column that decides whose children they can see.
 *
 * ⚠️ THREE ARGUMENTS, AND NO MORE. There is deliberately no club id and no
 * email parameter:
 *   - the club is derived from the team, server-side. A caller-supplied club
 *     could point the membership at a different club from the player, and
 *     every visibility check downstream assumes those agree;
 *   - the contact email is read from `auth.users`, server-side — the same
 *     property that makes claim_roster_access safe. An address someone typed
 *     is not evidence of anything.
 *
 * The membership comes back with `status = 'pending'`: the person can see
 * their own child and the squad's fixtures, and nothing else, until an admin
 * approves them (see approveMembership below).
 *
 * Errors are re-thrown as an Error with a human sentence, chosen by
 * `error.code` (see REGISTER_MESSAGES). `.code` is preserved on the thrown
 * error so a caller that wants to branch on the reason still can without
 * going anywhere near the wording.
 */
export async function registerMyPlayer(fullName, teamId, gender = null) {
  const { data, error } = await supabase.rpc('register_my_player', {
    p_full_name: fullName,
    p_team_id: teamId,
    // Required by the FUNCTION when the squad is single-gender, optional
    // otherwise — the rule lives in private.squad_expects_gender, not here, so
    // this parameter is simply passed through. Defaults to null so a caller
    // registering into a mixed squad reads the same as it always did.
    p_gender: gender ?? null,
  })

  if (error) {
    const friendly = new Error(REGISTER_MESSAGES[error.code] ?? error.message ?? REGISTER_FALLBACK)
    friendly.code = error.code
    throw friendly
  }

  return data
}

// Same silent-refusal shape as every other write in this module: `memb manage`
// is `private.is_admin(club_id)`, so a non-admin's UPDATE matches zero rows and
// PostgREST reports that as a successful empty response rather than an error.
// The read-back is what turns it into something the screen can show.
//
// ⚠️ A COACH GETS THIS MESSAGE, and that is correct today. `memb manage` is
// admin-only — there is no coach clause in it — and `memb read` is
// `profile_id = auth.uid() OR is_admin(club_id)`, so a coach cannot even SEE a
// pending membership for their own squad, let alone approve one. The spec
// (claude/decisions/2026-08-08-parent-self-registration.md §5) assumed "coach
// or admin"; the database says admin only. Verified against the live policies
// on 8 Aug 2026, not assumed.
// ⚠️ NO LONGER REACHABLE, AND KEPT ANYWAY — see approveMembership below. The
// function now calls an RPC that RAISES on refusal instead of silently
// matching zero rows, so this string is a fallback for an RPC that somehow
// returns nothing at all. Deleting it would leave that case throwing
// `undefined`.
const REFUSED_MEMBERSHIP_APPROVE =
  "We couldn't approve that person. Ask a club admin if that looks wrong."

/**
 * Approves one PENDING membership by flipping its status to 'active', and
 * returns the updated row.
 *
 * That single column is the whole approval: `private.can_see_team` requires
 * `status = 'active'`, so this is the moment the person stops seeing only
 * their own child and starts seeing the squad. Nothing else about the row
 * changes — the role, team and linked player were all decided when the parent
 * registered.
 *
 * Deliberately NOT expressed as a generic "set status" writer. There is no
 * un-approve: moving an active row back to pending would half-revoke someone
 * in a way no screen explains, and the existing revoke (deleteMembership) is
 * the honest way to take access away.
 *
 * ⚠️ AN RPC SINCE 9 Aug 2026, NOT A TABLE UPDATE, AND THAT IS THE WHOLE POINT.
 * Jay asked for coaches and team managers to approve for their own age groups.
 * The obvious way to do that is to widen the `memb manage` policy — but read
 * what it is first: `FOR ALL USING private.is_admin(club_id)`. FOR ALL, and
 * RLS grants ROWS not COLUMNS, so widening it would also hand every coach the
 * ability to change a member's ROLE (including to admin), move them to another
 * squad, and DELETE access. public.approve_membership is SECURITY DEFINER with
 * `status` as a literal in the SET list, so there is no parameter through which
 * anything else could be written.
 *
 * ⚠️ AND IT FIXES A BUG THE OLD SHAPE WOULD HAVE HAD. The table update read the
 * row back with `.select()`. A coach's new read policy only shows PENDING rows,
 * so the moment they approved one it would leave their view, the read-back
 * would return nothing, and a successful approval would have been reported to
 * them as a refusal. The RPC returns the row from inside SECURITY DEFINER,
 * where that policy does not apply.
 */
export async function approveMembership(membershipId) {
  if (!membershipId) throw new Error('approveMembership needs a membershipId.')

  const { data, error } = await supabase.rpc('approve_membership', {
    p_membership_id: membershipId,
  })

  if (error) {
    // The RPC's own sentences are written for the person reading them — "You
    // can only approve players for your own age groups." — so they are passed
    // through rather than replaced. Same reasoning as the 22004 case in
    // registerMyPlayer above.
    const friendly = new Error(error.message || REFUSED_MEMBERSHIP_APPROVE)
    friendly.code = error.code
    throw friendly
  }
  if (!data) throw new Error(REFUSED_MEMBERSHIP_APPROVE)
  return data
}

/**
 * Saves the first/family name the person entered themselves, and records that
 * they entered it.
 *
 * Distinct from `updateProfileName` above, which writes `full_name` and is what
 * an ADMIN uses to fix someone else's name from the Accounts screen. This one
 * is the person speaking for themselves, and it is the only writer of
 * `name_confirmed_at`.
 *
 * ⚠️ `full_name` is NOT written here. The `profiles_sync_name` trigger rebuilds
 * it from first/last, so writing it too would be sending a value the database
 * is about to overwrite — and if the two ever disagreed, the one that lost
 * would depend on trigger ordering rather than on intent.
 *
 * A blank family name is allowed; a blank first name is not. Plenty of people
 * have one name, and forcing them to invent a second is worse than storing
 * null. `full_name` comes out as just the first name in that case, which is
 * what every screen then displays.
 */
export async function updateProfileNames({ profileId, firstName, lastName } = {}) {
  if (!profileId) throw new Error('updateProfileNames needs a profileId.')

  const first = typeof firstName === 'string' ? firstName.trim() : ''
  const last = typeof lastName === 'string' ? lastName.trim() : ''
  if (!first) throw new Error('Enter your first name.')

  const { data, error } = await supabase
    .from('profiles')
    .update({
      first_name: first,
      last_name: last || null,
      name_confirmed_at: new Date().toISOString(),
    })
    .eq('id', profileId)
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_PROFILE)
  return data
}

/**
 * Saves the two things a member may change about THEMSELVES: their name and
 * their phone number. Written for the "You" card on /more (Jay, 8 Aug 2026).
 *
 * WHY THIS EXISTS AT ALL. Until now the only self-service editing in the app
 * was MyPlayerForm, reached from a linked player. A parent whose membership
 * has `player_id = null` — the shape you get when an admin grants access by
 * hand rather than through registration — has no linked player, so
 * YourPlayers renders nothing and that person could edit literally nothing
 * about themselves anywhere in the app.
 *
 * ⚠️ THE PHONE IS ON THE PROFILE, NOT ON THE PLAYER (Jay's ruling, 8 Aug
 * 2026). `player_contacts.phone` is how you reach the CHILD; this is how you
 * reach the PERSON SIGNED IN, who is frequently not a player at all. Storage
 * format is the same E.164 string the rest of the app uses, produced by
 * joinPhone() in the caller — see src/lib/phone.js. Null, never '', when the
 * field is cleared: an empty string would sort and compare as a real value.
 *
 * ⚠️ THIS DELIBERATELY CANNOT WRITE `email`, AND NEITHER CAN ANYTHING ELSE.
 * RLS grants ROWS, not columns, so `profile update own` used to let a person
 * rewrite `profiles.email` and desync it from the address they actually sign
 * in with — which is the address an admin reads on the Accounts screen when
 * deciding whether to approve a stranger. Column privileges for
 * `authenticated` are now an allow-list: full_name, first_name, last_name,
 * name_confirmed_at, phone. Adding `email` to the object below would not
 * quietly succeed, it would fail the whole update — which is the correct
 * outcome, and the reason no email field exists on the form.
 *
 * `name_confirmed_at` is written for the same reason updateProfileNames
 * writes it: this is the person stating their own name, which is exactly what
 * that column records. Someone who fills this card in should not then be
 * asked the same question by NamePrompt on next sign-in.
 */
export async function updateMyProfile({ profileId, firstName, lastName, phone } = {}) {
  if (!profileId) throw new Error('updateMyProfile needs a profileId.')

  const first = typeof firstName === 'string' ? firstName.trim() : ''
  const last = typeof lastName === 'string' ? lastName.trim() : ''
  // Same rule as updateProfileNames: a blank family name is fine (plenty of
  // people have one name), a blank first name is not — full_name is rebuilt
  // from these by the profiles_sync_name trigger, and a blank one renders as
  // an account with no name anywhere in the app.
  if (!first) throw new Error('Enter your first name.')

  const trimmedPhone = typeof phone === 'string' ? phone.trim() : ''

  const { data, error } = await supabase
    .from('profiles')
    .update({
      first_name: first,
      last_name: last || null,
      phone: trimmedPhone || null,
      name_confirmed_at: new Date().toISOString(),
    })
    .eq('id', profileId)
    .select()
    .maybeSingle()

  if (error) throw error
  // A refusal is a successful zero-row response, not an error — the same
  // silent-refusal shape every other writer in this module reads back.
  if (!data) throw new Error(REFUSED_MY_PROFILE)
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
const REFUSED_MEMBERSHIP_GRANT =
  "We couldn't give that person access. You may not have permission to manage members."
const REFUSED_MEMBERSHIP_DELETE =
  "We couldn't remove that member's access. You may not have permission to manage members."
const REFUSED_PROFILE =
  "We couldn't save that name. You may not have permission to change this member's details."
// Separate wording for the self-service card on /more: the message above is
// written for an admin editing SOMEBODY ELSE, and telling a parent they may
// not have permission to change "this member's details" when the member is
// themselves reads as a bug.
const REFUSED_MY_PROFILE = "We couldn't save your details. Try again."

// Kept in step with the memberships_role_check CHECK constraint
// (db/migrations/20260805_roles_manager_and_medic.sql). This is a friendly
// client-side guard only — the constraint is what actually refuses a bad
// value, so a value missing here can block a legitimate write but nothing
// here can smuggle one past the database.
const ROLES = ['admin', 'coach', 'manager', 'medic', 'parent', 'player']

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
 * Validates one caller-facing membership grant and turns it into the column
 * object to insert. Not exported — it exists so grantMembership and
 * grantMemberships cannot drift into two different conventions, which is
 * exactly the risk when the same rule is written out twice.
 *
 * The rule is the one updateMembershipRole enforces, unchanged: memberships
 * has no check constraint mirroring the (now dropped) invites one, so
 * JavaScript is where it is enforced or it is not enforced at all.
 *   - role 'admin' → team_id written as null whatever was passed. A form's
 *     age-group select may still hold a stale selection at the moment the
 *     role becomes admin; coercing to the single valid value cannot corrupt
 *     anything, and throwing would fail for a reason the user cannot see.
 *   - any other role → a null/absent teamId throws, before any network call.
 *     There is no safe value to coerce to, and a null team_id would quietly
 *     strand the account with no age group.
 *
 * `label` names the calling function in the argument-shape errors so a
 * mistake points at the function the caller actually called.
 */
function toMembershipRow({ profileId, clubId, role, teamId, playerId } = {}, label) {
  if (!profileId) throw new Error(`${label} needs a profileId.`)
  if (!clubId) throw new Error(`${label} needs a clubId.`)
  if (!ROLES.includes(role)) {
    throw new Error(`${label} needs a role of ${ROLES.join(', ')}.`)
  }

  const isAdminRole = role === 'admin'
  if (!isAdminRole && !teamId) {
    throw new Error('Choose an age group for this role.')
  }

  return {
    profile_id: profileId,
    club_id: clubId,
    role,
    team_id: isAdminRole ? null : teamId,
    player_id: playerId ?? null,
  }
}

/**
 * Creates one membership row — "grant access" for someone who signed up but
 * was never invited, and so has no membership at all (see
 * listPendingProfiles). Returns the new row.
 *
 * No new policy was needed for this: `memb manage` on memberships is
 * FOR ALL with USING+WITH CHECK `private.is_admin(club_id)`, so its WITH
 * CHECK already covers INSERT — verified against the live policy rather than
 * assumed. A non-admin's insert is therefore refused the same silent way
 * every other write in this module is: success, zero rows, no error. Hence
 * the `.select().maybeSingle()` read-back and the throw on null.
 *
 * The role/team rule is the SAME one updateMembershipRole enforces, and for
 * the same reason: memberships has no check constraint mirroring
 * `invites_team_required_unless_admin`, so JavaScript is the only place it is
 * enforced at all. Both halves behave identically to that function on
 * purpose — role 'admin' coerces team_id to null whatever was passed (a
 * form's team dropdown may still hold a stale selection), any other role with
 * a null/absent teamId throws before the network call (there is no safe value
 * to coerce to, and a null team_id scopes the account to nothing).
 *
 * playerId is optional and defaults to null, like createInvite's: an admin or
 * coach grant links to no player, and a parent/player grant can be linked
 * later from the Accounts screen.
 */
export async function grantMembership(fields = {}) {
  const row = toMembershipRow(fields, 'grantMembership')

  const { data, error } = await supabase
    .from('memberships')
    .insert(row)
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_MEMBERSHIP_GRANT)
  return data
}

/**
 * Creates MANY membership rows in one insert and returns them.
 *
 * This is the multi-access grant: one person legitimately holds several
 * membership rows — a parent of two children in different age groups, a coach
 * of two squads, a coach who is also a parent. memberships has never had a
 * unique constraint on (profile_id, club_id, role), so that has always been
 * legal at the database level and scope.js already unions the rows correctly;
 * only the grant path assumed one row per person.
 *
 * Takes an array of the SAME `{ profileId, clubId, role, teamId, playerId }`
 * shape grantMembership takes, and applies the SAME rule to each via the
 * shared toMembershipRow() — role 'admin' coerces team_id to null, any other
 * role with a null/absent teamId throws. The whole array is validated BEFORE
 * the network call, so one bad row means nothing is written rather than a
 * half-applied grant.
 *
 * Rows differing only in role are kept: `{coach, U14}` plus `{parent, U10}`
 * is precisely the mixed-role case this exists for.
 *
 * IDENTICAL rows are collapsed to one before inserting. The database cannot
 * do this — there is no unique constraint to conflict on — so a UI that
 * offers the same age group twice would otherwise create two identical rows
 * that look like one and take two revokes to remove. (Duplicate admin rows
 * have bitten this project before; see RESTORE.md.) This is the within-one-
 * save guard only: refusing a row the person ALREADY holds needs their
 * existing rows, which this function does not have, and belongs in the
 * screen.
 *
 * One statement, not a loop, which decides what failure means — the same
 * all-or-nothing reasoning as insertPlayers() in src/data/players.js.
 * PostgREST sends a multi-row insert as a single statement, so an RLS WITH
 * CHECK violation on any row aborts the lot; there is no partial grant to
 * reconcile.
 *
 * An empty (or non-array) input returns [] without querying, matching
 * listPlayers({teamIds: []})/insertPlayers([]).
 */
export async function grantMemberships(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return []

  const built = rows.map((fields) => toMembershipRow(fields, 'grantMemberships'))

  // De-duplicate on the full row, not on a subset: two parent rows for the
  // same team but different children are different access and must both be
  // written. Insertion order is preserved so the caller's list reads back the
  // way it was built.
  const seen = new Set()
  const unique = built.filter((row) => {
    const key = JSON.stringify([row.profile_id, row.club_id, row.role, row.team_id, row.player_id])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const { data, error } = await supabase.from('memberships').insert(unique).select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error(REFUSED_MEMBERSHIP_GRANT)
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
