// Pure membership/scope helpers. No imports from supabase, react, or auth —
// these must stay trivially testable with plain fixture arrays. Nothing here
// makes a network call or reads global state.
//
// Data model reminder (see memberships table): role is one of
// 'admin' | 'coach' | 'manager' | 'medic' | 'parent' | 'player'. An admin row
// has team_id = null (admin is club-wide, not team-scoped) — every other role
// has a team_id. One person can hold several membership rows (several
// roles/teams at once).

/**
 * The squad-level STAFF roles: everyone who may edit a squad they are
 * attached to. 'manager' (shown as "Team Manager") and 'medic' were added
 * 5 Aug 2026 and are IDENTICAL to 'coach' in what they may do — the
 * distinction is documentary, so the club can record who fills which job.
 *
 * ⚠️ This list MIRRORS private.can_edit_team() in the database
 * (db/migrations/20260805_roles_manager_and_medic.sql). The two must stay in
 * step, and tests/scope.test.js pins the exact set so a change here without a
 * migration is caught. The SQL is the real boundary; this list only decides
 * what the UI offers, so drift can hide a squad from someone entitled to it
 * but can never let a write through that RLS would refuse.
 *
 * A future staff role is one entry here plus one line in that migration —
 * nothing else in the app tests for 'coach' directly.
 */
export const SQUAD_STAFF_ROLES = ['coach', 'manager', 'medic']

/** True if this role may edit the squad its membership row points at. */
export function isSquadStaffRole(role) {
  return SQUAD_STAFF_ROLES.includes(role)
}

/**
 * The role that may carry `memberships.is_head_coach` — 18 Aug 2026.
 *
 * ⚠️ IT LIVES HERE BECAUSE tests/staff-roles.test.jsx REFUSES `=== 'coach'`
 * ANYWHERE IN src/ BUT THIS FILE, and that rule caught the first version of the
 * head-coach checkbox, which tested the literal inline. The list above is the
 * one place the roles are named.
 *
 * ⚠️ IT MIRRORS A DATABASE CONSTRAINT AND MUST STAY IN STEP.
 * `memberships_head_coach_is_a_squad_coach` refuses the flag on anything that
 * is not a coach with a squad, so a UI that offered it more widely would be
 * offering a control that always fails. The SQL is the real boundary; this only
 * decides what the screen shows.
 */
export function canHoldHeadCoachFlag(role) {
  return role === SQUAD_STAFF_ROLES[0]
}

// Precedence decides the ONE label shown for someone holding several rows.
// Jay's ruling 5 Aug: nobody is expected to hold both coach and manager, so
// the order between the staff roles is arbitrary but must be stable.
const ROLE_PRECEDENCE = ['admin', 'coach', 'manager', 'medic', 'parent', 'player']
const ROLE_LABELS = {
  admin: 'Admin',
  coach: 'Coach',
  manager: 'Team Manager',
  medic: 'Medic',
  parent: 'Parent',
  player: 'Player',
}

/**
 * The roles that may APPROVE a pending registration for a squad.
 *
 * ⚠️ SHORTER THAN SQUAD_STAFF_ROLES ON PURPOSE. Medic is a squad staff role —
 * a medic can see and edit players, which is the point of it — but admitting a
 * stranger to a children's squad is not a medical decision. Jay's ruling,
 * 9 Aug 2026: coach and team manager.
 *
 * Mirrors `private.can_approve_team` in
 * db/migrations/20260809_squad_staff_approval.sql, which is the real boundary.
 * If this list ever gains a role the SQL has not, the UI offers an Approve
 * button the database then refuses — annoying. If the SQL gains one this list
 * has not, the person simply never sees the queue — safe. Change both.
 */
export const APPROVER_ROLES = ['coach', 'manager']

/**
 * The roles that may ADD or REMOVE a document in the documents repo.
 *
 * ⚠️ SHORTER THAN SQUAD_STAFF_ROLES, FOR THE SAME REASON APPROVER_ROLES IS.
 * A medic READS staff documents — that is the point of the staff tier — but a
 * coach or team manager curates them. The database splits the two sets
 * explicitly: `private.can_read_document` admits ('coach','manager','medic')
 * and `private.is_active_staff_of`, which `private.can_manage_document` and
 * every storage write policy call, admits ('coach','manager') only.
 *
 * Mirrors `m.role in ('coach','manager')` in private.is_active_staff_of
 * (db/migrations/20260831_documents.sql), which is the real boundary. If this
 * list ever gains a role the SQL has not, the UI draws an Add or Remove
 * control the database then refuses — which is exactly the dead medic Remove
 * button caught in Task 6's review. If the SQL gains one this list has not,
 * that person simply is not offered the control — safe. Change both.
 *
 * ⚠️ IT LIVES HERE, NOT IN src/lib/documents.js, so the role literals stay in
 * the one file that names them — the same arrangement APPROVER_ROLES and
 * SQUAD_STAFF_ROLES already have, and what tests/staff-roles.test.jsx's
 * "no `=== 'coach'` outside scope.js" rule is reaching for.
 */
export const UPLOAD_ROLES = ['coach', 'manager']

/**
 * Whether a membership row is GRANTED access rather than a request for it.
 *
 * ⚠️ EXACT EQUALITY, MATCHING THE SQL, AND NOT `!== 'pending'`. The Accounts
 * screen deliberately splits its lists the other way round — a row with an
 * unexpected status is shown as real access there, so it lands under Revoke
 * rather than being invisible. That is right for a LIST and wrong for a GATE:
 * the same default that avoids hiding somebody would, here, admit them.
 * `memberships.status` is NOT NULL with default 'active', so there is no
 * legacy row this can strand.
 *
 * Mirrors `and m.status = 'active'` in private.can_approve_team,
 * can_see_team and can_edit_team.
 */
export function isActiveMembership(membership) {
  return membership?.status === 'active'
}

/**
 * Whether this person may approve registrations for at least one squad, and is
 * therefore worth showing an approvals screen to at all.
 *
 * Admin anywhere counts. A parent or player never does — including a parent of
 * a child in the squad, which is the case that would turn the whole pending
 * design into theatre.
 *
 * ⚠️ A PENDING ROW IS A REQUEST, NOT ACCESS — 17 Aug 2026, and this omission
 * was a live hole rather than an untidiness. `request_staff_role` inserts a
 * coach membership with status 'pending'; until this test existed, asking to
 * coach a squad was enough to be shown its approval queue, and
 * private.can_approve_team agreed, so the Approve button then worked. Measured
 * against production: a pending coach could approve, an active one could too,
 * and a coach of another squad could not. See
 * db/migrations/20260817_approve_requires_active_membership.sql and
 * db/tests/approve-status-gate.sql.
 *
 * ⚠️ loadMyMemberships RETURNS PENDING ROWS and must keep doing so — the app
 * needs them to tell somebody their request is waiting. The filtering belongs
 * here, at the question "may you approve", not in the fetch.
 */
export function canApproveAnything(memberships) {
  if (!memberships) return false
  return memberships.some(
    (m) =>
      isActiveMembership(m) &&
      (m.role === 'admin' || (APPROVER_ROLES.includes(m.role) && m.team_id != null)),
  )
}

/**
 * Whether this person may approve for ONE specific squad.
 *
 * ⚠️ `teamId == null` is refused BEFORE the admin check, matching canEditTeam
 * directly below. A membership row with no team is an admin row; treating a
 * missing team id as "any team" would make a null on a pending row approvable
 * by anybody who happened to be an admin of some other club.
 */
export function canApproveTeam(memberships, teamId) {
  if (!memberships || teamId == null) return false
  if (isAdmin(memberships)) return true
  // ⚠️ isActiveMembership FIRST — see canApproveAnything above. A pending
  // coach request named this squad and would otherwise answer true for it,
  // which is precisely the row that must not approve.
  return memberships.some(
    (m) => isActiveMembership(m) && APPROVER_ROLES.includes(m.role) && m.team_id === teamId,
  )
}

/**
 * True if any membership row is an ACTIVE admin.
 *
 * ⚠️ `isActiveMembership` ADDED 18 Aug 2026, and this function had gone without
 * it since it was written. It is the client half of
 * db/migrations/20260818_admin_gates_require_active_membership.sql, which added
 * the same test to private.is_admin and its three siblings — the deferral
 * recorded by the 17 Aug approval fix, taken.
 *
 * ⚠️ NOTHING CAN CREATE A PENDING ADMIN ROW TODAY, so this changes what nobody
 * currently sees. `request_staff_role` refuses any role but coach/manager/medic
 * and `set_admin_rights` writes active; production held zero non-active admin
 * memberships when this was measured. That is why it was safe to defer and why
 * it is safe to apply — it is NOT a reason to have left it, because the day a
 * path creates one is the day this becomes the 17 Aug bug with the whole admin
 * surface behind it.
 *
 * ⚠️ isSuperAdmin and adminRights BOTH ALREADY TESTED status, which is what
 * made this an inconsistency rather than a design. A person could fail
 * isSuperAdmin and pass isAdmin off the same row.
 *
 * Like everything in this file, this decides only what the UI offers. The
 * boundary is RLS — 15 policies across 9 tables call private.is_admin, and two
 * more call private.is_admin_anywhere.
 */
export function isAdmin(memberships) {
  if (!memberships) return false
  return memberships.some((m) => isActiveMembership(m) && m.role === 'admin')
}

/**
 * The squads whose PARENT view a coach or team manager may preview — their
 * own, and no one else's. Jay's ruling, 26 Aug 2026: "i want them to be able
 * to view as a parent of their own age group so they can see what parents
 * will see", after declining the wider offer (other squads, coach personas).
 * Medic deliberately absent — he named coaches and managers.
 *
 * Like everything in this file this decides what the UI offers; the preview
 * only narrows what the browser displays and never widens RLS access.
 */
export function parentPreviewTeamIds(memberships) {
  return [
    ...new Set(
      (memberships ?? [])
        .filter(
          (m) =>
            isActiveMembership(m) && (m.role === 'coach' || m.role === 'manager') && m.team_id,
        )
        .map((m) => m.team_id),
    ),
  ]
}

// ══ SUPER ADMIN, AND PER-ADMIN RIGHTS (10 Aug 2026) ═══════════════════════
//
// ⚠️ A FLAG ON THE MEMBERSHIP, NOT A ROLE VALUE, and the reason is measured:
// TWELVE places in the schema test `m.role = 'admin'`. A new role value would
// have to be added to every one, and each is a chance to miss one — where a
// miss silently strips a super admin of an ordinary admin power. A boolean
// makes a super admin an admin, so all twelve keep working untouched.
// Reasoning in full: claude/decisions/2026-08-10-role-dashboards.md.
//
// ⚠️ THE RIGHTS IN THIS LIST GATE SCREENS. SOME OF THEM ALSO NAME REAL DATA
// BOUNDARIES NOW — this sentence read "the rights gate screens, not data"
// until 30 Aug 2026, and that described pre-Phase-1 (the 10 Aug "trusted
// volunteers" posture, where every admin saw every child's details). The
// admin-rights redesign turned that off in the DATABASE: child DOB/contacts
// read/edit, child photos, player writes and DM review are all RLS-enforced
// allowlists keyed on these right values (the canSee/canEdit/canWrite/
// canReview helpers below mirror them). The rule that survives unchanged:
// a screen that hides a row is not security — the RLS policy is the boundary,
// and these helpers only keep the UI honest about it. A future right that
// must withhold data needs its OWN policy; adding it here draws a checkbox
// and nothing more.
//
// ⚠️ `clubadmin` (28 Aug 2026, Phase 0a) IS THE SIXTH, AND IT IS DIFFERENT IN
// INTENT — it is the base "Club Hub Admin" right that every admin holds
// (existing admins were backfilled, db/migrations/20260828_clubadmin_right.sql),
// and it is the linchpin of the admin-rights redesign
// (claude/plans/2026-08-28-admin-rights-migration.md). In Phase 0a it STILL
// only gates a screen: it flips the Club Hub Admin portal from `right: null` to
// `right: 'clubadmin'` (src/lib/portals.js). `is_admin` is unchanged, so the
// data every admin sees is unchanged — the sentence above holds for it too.
// The redesign's LATER phases turn specific surfaces (parent contacts/DOB,
// photos, children write-access, DM review) into real RLS boundaries; those do
// not live in this list, they live in the database.
//
// ⚠️ CHANGE ONE, CHANGE BOTH — the same arrangement SQUAD_STAFF_ROLES has with
// private.can_edit_team. The database deliberately has NO check constraint on
// these values (that would mean a migration per job title, for a value that
// gates a screen and cannot do harm), so this list is the only vocabulary
// there is. An unrecognised right matches no dashboard and is inert.
// `welfare` (23 Aug 2026) IS a data permission since Phase 4 (28-30 Aug
// 2026): private.can_review_dm keys on it, gating DM review, the welfare
// directory (welfare_overview) and DM/group report handling in RLS. The 23 Aug
// "any admin can read a DM" ruling is DEAD. It is also the one right a super
// does NOT hold implicitly — see canReviewDm below.
// ⚠️ The three `chat-*` rights (30 Aug 2026) are CHANNEL ACCESS, not a
// dashboard: each puts the ticked admin into one role channel
// (db/migrations/20260830_role_channels.sql — private.in_role_channel is the
// enforcement; this list only draws the checkbox). Welfare's channel needs no
// new right: the existing `welfare` grant IS its membership.
export const ADMIN_RIGHTS = [
  'youth', 'media', 'pitches', 'training', 'welfare', 'clubadmin',
  'chat-headcoaches', 'chat-managers', 'chat-medics',
]

// Job titles for squad staff — what `memberships.title` is usually set to.
//
// ⚠️ SUGGESTIONS, NOT A WHITELIST, AND THE DIFFERENCE IS THE WHOLE DESIGN.
// `memberships.title` is free text with NO check constraint, for the same
// reason ADMIN_RIGHTS has none: a constraint would mean a migration per job
// title, for a value that labels a person and grants nothing. This list only
// decides what the picker offers. A club that wants "Forwards Coach" types it,
// and nothing breaks.
//
// ⚠️ A TITLE IS NEVER PERMISSION. private.can_edit_team keys off `role`, so
// "Head Coach" grants exactly what `coach` grants. If anything ever branches on
// a title, that is the bug — the same rule that stops a squad RENAME handing
// somebody a role (20260806_claim_roster_access.sql).
//
// ⚠️ JAY'S FOUR, VERBATIM, 16 Aug 2026: "should be Head Coach, Assistant Coach,
// Team Manager, Medic".
//
// ⚠️ THIS OVERTURNS A PRIOR RULING THAT SAT HERE, and the old one is worth
// knowing because it was not silly. It read: "MEDIC HAS NO TITLE OF ITS OWN
// HERE on purpose: 'Medic' is already the role label, so a title would be
// repeating it. A club with a physio types one." The fourth suggestion was
// "Physio" on that reasoning.
//
// It loses to the person who uses the screen. The repetition it avoided is
// invisible — the picker offers titles, and a medic choosing "Medic" sees one
// word, not two — while the cost was real: the only medical title on offer was
// one this club does not use, so the field's suggestions were wrong for the
// commonest case in order to be tidy about the rarest. "A club with a physio
// types one" is still true, and now cuts the other way.
export const STAFF_TITLES = ['Head Coach', 'Assistant Coach', 'Team Manager', 'Medic']

// ⚠️ JAY'S EXACT WORDING, 12 Aug 2026, AND TWO OF THE THREE ARE NOT JOB TITLES.
// "we aren't going to use human names anymore, only Club Youth Manager, Pitch
// Management, Social Media Management from now on". These were Youth Manager /
// Social Media Manager / Pitch Manager — titles a person holds — and the
// mismatch was put to Jay before the change; he chose this wording anyway, so
// the PROSE around them moved instead. That is why the not-authorised screens
// say "hasn't been added to your account" rather than "you haven't been given
// the X job", and why the pitch emails say "you look after X for the club".
// Reverting these to "Manager" would silently un-fix three sentences.
// claude/decisions/2026-08-12-jobs-not-people.md
const ADMIN_RIGHT_LABELS = {
  youth: 'Club Youth Manager',
  media: 'Social Media Management',
  pitches: 'Pitch Management',
  // ⚠️ PERSON-SHAPED, AND JAY CHOSE IT ANYWAY (20 Aug 2026) — see
  // claude/plans/2026-08-12-training-session-plans.md. The jobs-not-people
  // ruling above stands for the other three; this wording is his, put to him
  // with the mismatch spelled out, exactly as the other three were on 12 Aug.
  // ⚠️ SO THE PROSE AROUND IT DOES NOT MOVE: the refusal card still reads
  // "hasn't been added to your account", because that sentence works for a
  // person-shaped name too and having two shapes of refusal would be worse
  // than having two shapes of name.
  training: 'Rugby Performance Director',
  // A job, not a person — the 12 Aug wording rule.
  welfare: 'Welfare',
  // ⚠️ THE BASE ADMIN RIGHT (28 Aug 2026, Phase 0a). Its label MUST stay
  // 'Club Hub Admin' — the Club Hub Admin portal (src/lib/portals.js) now draws
  // its card and heading from adminRightLabel('clubadmin') rather than from a
  // string on the portal, so the two had one home the moment the portal gained
  // a `right`. Change this and you rename the card.
  clubadmin: 'Club Hub Admin',
  // Channel access, not jobs — each tick seats the admin in one role channel.
  'chat-headcoaches': 'Chat: Club Head Coaches',
  'chat-managers': 'Chat: Club Age Group Managers',
  'chat-medics': 'Chat: Club Medics',
}

/** The human label for a right, or the raw value if it is one we do not know. */
export function adminRightLabel(right) {
  return ADMIN_RIGHT_LABELS[right] ?? right
}

/**
 * True if any membership row is an ACTIVE admin carrying the super flag.
 *
 * ⚠️ `status === 'active'` mirrors private.is_super_admin(). This client check
 * is a convenience for drawing the UI and is NOT the enforcement — the column
 * grant on `memberships` and the set_admin_rights RPC are. Anything that must
 * actually be prevented has to be prevented server-side.
 */
export function isSuperAdmin(memberships) {
  if (!memberships) return false
  return memberships.some((m) => m.role === 'admin' && m.status === 'active' && m.is_super === true)
}

/**
 * Every admin right the person holds, across all their membership rows.
 *
 * ⚠️ A SUPER ADMIN IMPLICITLY HOLDS ALL OF THEM. Otherwise Jay would have to
 * grant himself each new right as he invents it, and the first thing he would
 * do on finding a dashboard missing is wonder whether the feature shipped.
 */
export function adminRights(memberships) {
  if (!memberships) return []
  if (isSuperAdmin(memberships)) return [...ADMIN_RIGHTS]
  const held = new Set()
  for (const membership of memberships) {
    if (membership.role !== 'admin' || membership.status !== 'active') continue
    for (const right of membership.admin_rights ?? []) held.add(right)
  }
  // Returned in ADMIN_RIGHTS order rather than the order the database happened
  // to store them, so a menu built from this cannot reorder itself between
  // reloads.
  return ADMIN_RIGHTS.filter((right) => held.has(right))
}

/** True if the person may see the dashboard behind `right`. */
export function hasAdminRight(memberships, right) {
  return adminRights(memberships).includes(right)
}

// ══ CHILD-CONTACT ALLOWLIST (S2, Phase 1 — 28 Aug 2026) ═══════════════════
//
// ⚠️ THIS IS A DATA BOUNDARY, NOT A SCREEN GATE. Unlike ADMIN_RIGHTS above,
// these decide who may see a child's DOB and their parents' contact — enforced
// in the DATABASE (RLS on player_contacts/player_parents/player_private, and the
// member_contact_card RPC), db/migrations/20260828_child_contacts_allowlist.sql.
// These client helpers ONLY decide whether the UI offers a contacts section; a
// pitches/training admin who is not offered it is refused the rows anyway.
//
// ⚠️ CHANGE ONE, CHANGE BOTH — the two arrays mirror can_see_child_contacts()
// and can_edit_child_contacts() in that migration, and the spec §5.2 matrix.
// welfare is READ-ONLY on children (note ¹), so it is absent from the EDIT list.
export const CHILD_CONTACTS_READ_RIGHTS = ['clubadmin', 'youth', 'media', 'welfare']
export const CHILD_CONTACTS_EDIT_RIGHTS = ['clubadmin', 'youth', 'media']

/** May this person READ a child's DOB / parent contact? (super holds it implicitly.) */
export function canSeeChildContacts(memberships) {
  if (isSuperAdmin(memberships)) return true
  return adminRights(memberships).some((right) => CHILD_CONTACTS_READ_RIGHTS.includes(right))
}

/** May this person EDIT a child's DOB / parent contact? welfare is read-only, so no. */
export function canEditChildContacts(memberships) {
  if (isSuperAdmin(memberships)) return true
  return adminRights(memberships).some((right) => CHILD_CONTACTS_EDIT_RIGHTS.includes(right))
}

// ── The sibling allowlists (S1 write, S3 photos, S7b DM review) ────────────
//
// ⚠️ SEPARATE ARRAYS ON PURPOSE, mirroring the SQL exactly: can_write_child /
// can_see_child_photos / can_edit_child_photos share the contacts allowlist's
// VALUE today but are separate functions in the database
// (db/migrations/20260828_child_write_allowlist.sql, _child_photos_allowlist.sql)
// so Jay can rule the surfaces apart later. Change one, change both.
export const CHILD_WRITE_RIGHTS = ['clubadmin', 'youth', 'media']
export const CHILD_PHOTOS_READ_RIGHTS = ['clubadmin', 'youth', 'media', 'welfare']
export const CHILD_PHOTOS_EDIT_RIGHTS = ['clubadmin', 'youth', 'media']

/** May this person's ADMIN hat write a player row? Mirrors private.can_write_child. */
export function canWriteChild(memberships) {
  if (isSuperAdmin(memberships)) return true
  return adminRights(memberships).some((right) => CHILD_WRITE_RIGHTS.includes(right))
}

/** May this person see children's photos? Mirrors private.can_see_child_photos. */
export function canSeeChildPhotos(memberships) {
  if (isSuperAdmin(memberships)) return true
  return adminRights(memberships).some((right) => CHILD_PHOTOS_READ_RIGHTS.includes(right))
}

/** May this person change children's photos? Mirrors private.can_edit_child_photos. */
export function canEditChildPhotos(memberships) {
  if (isSuperAdmin(memberships)) return true
  return adminRights(memberships).some((right) => CHILD_PHOTOS_EDIT_RIGHTS.includes(right))
}

/**
 * May this person review DMs — the welfare directory, reports on DM/group
 * messages, reading a reviewable conversation? Mirrors private.can_review_dm.
 *
 * ⚠️ NO isSuperAdmin SHORT-CIRCUIT, AND NOT adminRights() — DELIBERATELY, and
 * different from every helper above. A super must hold `welfare` EXPLICITLY
 * (spec §5.2 note ², 28 Aug 2026): reading children's private messages is the
 * one power that is never implicit, so a super self-ticks welfare (an audited
 * write) to review and unticks it after. adminRights() hands a super every
 * right, which is exactly the short-circuit this must not have.
 */
export function canReviewDm(memberships) {
  if (!memberships) return false
  return memberships.some(
    (m) =>
      m.role === 'admin' && m.status === 'active' && (m.admin_rights ?? []).includes('welfare'),
  )
}

/**
 * May this person write THIS player row? The client mirror of the "player
 * edit" policy (20260828_child_write_allowlist.sql):
 * `can_write_child() OR is_team_staff(team_id)` — an admin needs the write
 * allowlist, squad staff need to be ACTIVE on the squad. This is what the
 * roster's edit affordances should ask, NOT canEditTeam, whose admin arm is
 * any-admin and so draws dead controls for a pitches-only admin.
 */
export function canWritePlayer(memberships, teamId) {
  if (!memberships) return false
  if (canWriteChild(memberships)) return true
  if (teamId == null) return false
  return memberships.some(
    (m) => isActiveMembership(m) && isSquadStaffRole(m.role) && m.team_id === teamId,
  )
}

/**
 * True when the person holds membership rows and EVERY one of them is still
 * pending approval — the self-registered parent who has added a child and is
 * waiting for a club admin (see
 * db/migrations/20260808_membership_pending_status.sql).
 *
 * Deliberately "every", not "some". Someone who already has one approved squad
 * and has just registered a second child is a normal, fully-working member;
 * putting a "waiting to be approved" banner across their whole app would be
 * wrong. This state is for the person for whom nothing yet works properly.
 *
 * ⚠️ Zero memberships is FALSE, not true. That person has registered nothing
 * and is waiting for nobody — they get the "add your player" screen, which is
 * a different state with a different answer.
 *
 * ⚠️ A "view as" preview is also FALSE, and it no longer rests on a missing
 * field. syntheticMemberships() in src/lib/memberships.jsx now sets
 * `status: 'active'` explicitly — it used to build a row with no `status` at
 * all, and this note used to say so and call it the right answer. It was the
 * right answer HERE and the wrong one everywhere else: `src/lib/notices.js`
 * requires `status === 'active'`, so a preview silently could not post a
 * notice (16 Aug 2026).
 *
 * The consequence for this function is that it is now robust rather than
 * lucky. It was correct because `undefined === 'pending'` is false, which
 * would have broken the moment anyone wrote `!= 'active'` instead; with a real
 * 'active' on the row, both spellings give the same answer.
 *
 * Like everything in this file this decides only what the UI shows. RLS is
 * what actually withholds the squad from a pending member.
 */
export function isPendingOnly(memberships) {
  if (!memberships || memberships.length === 0) return false
  // ⚠️ 'left' ROWS ARE IGNORED FIRST, ADDED 2 Sep 2026. A 'left' membership
  // grants nothing server-side, so it is not a counter-example to "everything
  // I have is pending" — but `every` treated it as one. The parent whose first
  // child has quit and whose second is waiting for approval got the routed app
  // with no waiting banner and no explanation, while the database handed them
  // nothing: the worst of both screens.
  //
  // ⚠️ AND THE ALL-LEFT CASE STILL RETURNS FALSE, which is why the length
  // check below is not optional. Somebody whose every row is 'left' is not
  // waiting for anybody — isLeftOnly in src/lib/leavers.js is that state, and
  // AppShell gives it the roll-call screen, not a banner over an empty app.
  const live = memberships.filter((m) => m?.status !== 'left')
  if (live.length === 0) return false
  return live.every((m) => m.status === 'pending')
}

/**
 * Teams the given memberships grant visibility into.
 * Admins see every team in allTeams (their membership row has team_id null,
 * so it can't be used to look up teams — admin visibility is club-wide by
 * role, not by team_id). Everyone else sees the teams referenced by their
 * membership rows' team_id. Result is sorted by sort_order then name, and
 * allTeams is never mutated.
 */
export function visibleTeams(memberships, allTeams) {
  // ⚠️ PENDING squads stay VISIBLE on purpose (D6, 30 Aug 2026): a pending
  // membership still attaches the person to the squad (fixtures, their own
  // child) — see the memberships.status column comment. Visibility is not
  // capability: the edit gates (canEditTeam, canApproveTeam) each demand
  // status='active' themselves.
  if (!allTeams) return []
  if (!memberships || memberships.length === 0) return []

  const sorted = (teams) =>
    [...teams].sort((a, b) => {
      // Defensive: sort_order is NOT NULL in the schema, but a bad/partial
      // team record would otherwise turn this into NaN, which comparator
      // functions handle inconsistently across engines.
      const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
      if (orderDiff !== 0) return orderDiff
      return a.name.localeCompare(b.name)
    })

  if (isAdmin(memberships)) {
    return sorted(allTeams)
  }

  // ⚠️ 'left' ROWS ARE DROPPED FIRST, ADDED 2 Sep 2026 by the leavers review.
  // This function knew about two statuses and there are now three: it mapped
  // team_id off every row it was handed, so the moment a child was marked as
  // left their parent kept that squad in the nav, in the switcher and in
  // every "which squads am I in" list — a named, tappable age group the
  // database then returns nothing from. The pending note above still stands
  // and is why the test is `!== 'left'` and not `=== 'active'`.
  const teamIds = new Set(
    memberships
      .filter((m) => m?.status !== 'left')
      .map((m) => m.team_id)
      .filter((id) => id != null),
  )
  return sorted(allTeams.filter((team) => teamIds.has(team.id)))
}

/**
 * True if the given memberships grant edit rights on teamId: admins can edit
 * any team; coaches, team managers and medics can edit only the squads they
 * are attached to (SQUAD_STAFF_ROLES). Parents and players can never edit. A
 * null/undefined teamId always returns false, even for an admin — see the
 * guard comment below for why.
 */
export function canEditTeam(memberships, teamId) {
  // Guard first, before the admin short-circuit: a null/undefined teamId
  // means "we don't know which team" (an unresolved or not-yet-loaded id),
  // and the safe answer to "may I edit an unknown team?" is no — even for
  // an admin. This also blocks m.team_id === teamId from matching when both
  // sides happen to be null (e.g. a malformed coach row with no team_id).
  // players.team_id is NOT NULL, and a SQUAD event's team_id is a real id — so
  // a null here is an unresolved/partly-loaded id, and denying is right even for
  // an admin. ⚠️ A CLUB-WIDE EVENT's team_id IS legitimately null (30 Aug 2026),
  // and it must NOT come through here — it goes through canEditEvent, which knows
  // a null event.team_id is the whole-club value, not an unknown one. Do not
  // remove this guard, and do not "fix" it to admit null — that would wrongly
  // grant a squad event whose id failed to load.
  if (teamId == null) return false
  if (!memberships) return false
  if (isAdmin(memberships)) return true
  // ⚠️ isActiveMembership — a PENDING coach/manager request is not access
  // (Grok item 4, mirroring canApproveTeam and the SQL can_edit_team, which
  // requires status='active'). Without it a self-registered pending coach saw
  // live edit controls whose every write then failed at RLS.
  return memberships.some((m) => isActiveMembership(m) && isSquadStaffRole(m.role) && m.team_id === teamId)
}

/**
 * May this user edit THIS event? Like canEditTeam(event.team_id) for a squad
 * event, but a CLUB-WIDE event (team_id null, 30 Aug 2026) — which has no squad —
 * is editable by ADMINS ONLY, mirroring the RLS `event edit` policy
 * (`team_id is null and is_admin(club_id)`). Use this, not canEditTeam, wherever
 * an EVENT's editability is decided (EventDetail's footer, EventForm's gate), so
 * a whole-club social is not silently uneditable.
 */
export function canEditEvent(memberships, event) {
  if (!event) return false
  if (event.team_id == null) return isAdmin(memberships)
  return canEditTeam(memberships, event.team_id)
}

/**
 * Single human-readable label for the highest role held, precedence
 * admin > coach > manager > medic > parent > player. 'No access yet' when
 * there are no membership rows at all (e.g. an invited-but-not-yet-accepted
 * user).
 */
export function roleLabel(memberships) {
  const highest = highestRole(memberships)
  return highest ? ROLE_LABELS[highest] : 'No access yet'
}

/**
 * The KEY behind roleLabel — 'admin', 'coach', … — or null when there is no
 * membership. Split out on 23 Aug 2026 so the masthead can pick a Badge tone
 * (Badge is keyed by role, not by label) without a label-to-key map that would
 * be a second copy of ROLE_LABELS in reverse.
 */
export function highestRole(memberships) {
  if (!memberships || memberships.length === 0) return null
  const rolesHeld = new Set(memberships.map((m) => m.role))
  return ROLE_PRECEDENCE.find((role) => rolesHeld.has(role)) ?? null
}

/**
 * The label for ONE role, rather than for the highest of a set.
 *
 * ⚠️ THIS EXISTS SO ROLE_LABELS KEEPS ONE HOME. `roleLabel` above answers
 * "what is this person?", which is the wrong question on a screen that lists a
 * squad's staff — there, each membership row is shown in its own right and a
 * coach who is also a parent is being shown AS the coach. The alternative was a
 * second copy of the four words in a screen file, and two copies of a fact are
 * two copies that drift.
 *
 * An unrecognised role returns null rather than a guess, so a role added to the
 * database and not to this file renders as nothing instead of as a wrong label.
 */
export function labelForRole(role) {
  return ROLE_LABELS[role] ?? null
}

/**
 * Does the caller hold a parent/player membership for THIS player?
 *
 * The client-side mirror of private.is_own_player(uuid), and it decides only
 * whether to offer the self-service form. RLS and
 * public.set_own_player_photo() are what actually permit the writes, so
 * getting this wrong could hide the form from someone entitled to it, but
 * could never let anyone write a record they don't own.
 */
export function isOwnPlayer(memberships, playerId) {
  if (!memberships || !playerId) return false
  // ⚠️ NO status check, DELIBERATELY (30 Aug 2026): this mirrors the SQL
  // private.is_own_player, which is also status-blind — a pending parent may
  // still maintain their own child's record. Do not "fix" this in the next
  // add-status-everywhere pass.
  return memberships.some(
    (m) => m.player_id === playerId && (m.role === 'parent' || m.role === 'player'),
  )
}

/**
 * Deduplicated list of player_id values from parent/player membership rows,
 * ignoring nulls. For a parent this is their child(ren); for a player it is
 * themselves.
 */
export function childPlayerIds(memberships) {
  if (!memberships) return []

  const ids = memberships
    .filter((m) => m.role === 'parent' || m.role === 'player')
    .map((m) => m.player_id)
    .filter((id) => id != null)

  return [...new Set(ids)]
}
