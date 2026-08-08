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
 * True if any membership row has role 'admin'.
 */
export function isAdmin(memberships) {
  if (!memberships) return false
  return memberships.some((m) => m.role === 'admin')
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
 * ⚠️ A "view as" preview is also FALSE, and that rests on one strict equals:
 * syntheticMemberships() in src/lib/memberships.jsx builds a row with no
 * `status` field at all, so `undefined === 'pending'` is false. That is the
 * right answer — an admin previewing a squad is not pending — but if this ever
 * becomes a truthiness or `!= 'active'` check, an admin previewing as a parent
 * gets told they are waiting for approval.
 *
 * Like everything in this file this decides only what the UI shows. RLS is
 * what actually withholds the squad from a pending member.
 */
export function isPendingOnly(memberships) {
  if (!memberships || memberships.length === 0) return false
  return memberships.every((m) => m.status === 'pending')
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

  const teamIds = new Set(memberships.map((m) => m.team_id).filter((id) => id != null))
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
  // events.team_id and players.team_id are both NOT NULL in the schema, so
  // no real record can reach this path — only a bug or a partial load can,
  // and denying is the right call in both cases. Do not remove this guard.
  if (teamId == null) return false
  if (!memberships) return false
  if (isAdmin(memberships)) return true
  return memberships.some((m) => isSquadStaffRole(m.role) && m.team_id === teamId)
}

/**
 * Single human-readable label for the highest role held, precedence
 * admin > coach > manager > medic > parent > player. 'No access yet' when
 * there are no membership rows at all (e.g. an invited-but-not-yet-accepted
 * user).
 */
export function roleLabel(memberships) {
  if (!memberships || memberships.length === 0) return 'No access yet'

  const rolesHeld = new Set(memberships.map((m) => m.role))
  const highest = ROLE_PRECEDENCE.find((role) => rolesHeld.has(role))
  return highest ? ROLE_LABELS[highest] : 'No access yet'
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
