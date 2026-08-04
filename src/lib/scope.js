// Pure membership/scope helpers. No imports from supabase, react, or auth —
// these must stay trivially testable with plain fixture arrays. Nothing here
// makes a network call or reads global state.
//
// Data model reminder (see memberships table): role is one of
// 'admin' | 'coach' | 'parent' | 'player'. An admin row has team_id = null
// (admin is club-wide, not team-scoped) — every other role has a team_id.
// One person can hold several membership rows (several roles/teams at once).

const ROLE_PRECEDENCE = ['admin', 'coach', 'parent', 'player']
const ROLE_LABELS = {
  admin: 'Admin',
  coach: 'Coach',
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
 * any team, coaches can edit only the teams they coach. Parents and players
 * can never edit. A null/undefined teamId always returns false, even for an
 * admin — see the guard comment below for why.
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
  return memberships.some((m) => m.role === 'coach' && m.team_id === teamId)
}

/**
 * Single human-readable label for the highest role held, precedence
 * admin > coach > parent > player. 'No access yet' when there are no
 * membership rows at all (e.g. an invited-but-not-yet-accepted user).
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
