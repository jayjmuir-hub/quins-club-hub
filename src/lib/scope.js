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
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
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
 * can never edit.
 */
export function canEditTeam(memberships, teamId) {
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
