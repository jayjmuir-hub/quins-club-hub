import { supabase } from '../lib/supabase'

// Junior play-up — a super admin twins a junior's active home memberships
// onto a second junior age group. Guest rows stay status=active so roster
// and chat still work; playup_consent pending|approved is the parent gate
// for match lineup. Home stays players.team_id.

function refused(error, fallback) {
  const isRefusal = error?.code === '42501' || error?.code === '22023'
  if (isRefusal && error.message) return new Error(error.message)
  return new Error(fallback)
}

export async function addJuniorPlayup(playerId, guestTeamId) {
  const { error } = await supabase.rpc('add_junior_playup', {
    _player: playerId,
    _guest_team: guestTeamId,
  })
  if (error) throw refused(error, 'The player could not be added to that age group.')
}

export async function removeJuniorPlayup(playerId, guestTeamId) {
  const { error } = await supabase.rpc('remove_junior_playup', {
    _player: playerId,
    _guest_team: guestTeamId,
  })
  if (error) throw refused(error, 'The player could not be removed from that age group.')
}

export async function answerJuniorPlayup(playerId, guestTeamId, yes) {
  const { error } = await supabase.rpc('answer_junior_playup', {
    _player: playerId,
    _guest_team: guestTeamId,
    _yes: yes,
  })
  if (error) throw refused(error, 'That answer could not be saved.')
}

/**
 * This signed-in person's pending play-up guest rows (RLS: own memberships).
 */
export async function listMyPendingPlayups() {
  const { data, error } = await supabase
    .from('memberships')
    .select('player_id, team_id, playup_consent, status, players(full_name), teams:team_id(name)')
    .eq('playup_consent', 'pending')
    .eq('status', 'active')
  if (error) throw error
  return data ?? []
}

/**
 * Distinct guest squads this player holds an active membership in, with
 * playup_consent. Used by the super-admin Age groups block.
 */
export async function listPlayerGuestPlayups(playerId, homeTeamId) {
  if (!playerId) return []
  let query = supabase
    .from('memberships')
    .select('team_id, playup_consent')
    .eq('player_id', playerId)
    .eq('status', 'active')
  if (homeTeamId) query = query.neq('team_id', homeTeamId)
  const { data, error } = await query
  if (error) throw error
  const byTeam = new Map()
  for (const row of data ?? []) {
    if (!row.team_id) continue
    const prev = byTeam.get(row.team_id)
    if (prev?.playup_consent === 'pending') continue
    byTeam.set(row.team_id, {
      team_id: row.team_id,
      playup_consent: row.playup_consent === 'pending' ? 'pending' : (row.playup_consent ?? prev?.playup_consent ?? null),
    })
  }
  return [...byTeam.values()]
}

/**
 * Distinct team ids this player holds an active membership in, other than
 * their home squad. Used by the super-admin Age groups block; RLS still
 * decides which membership rows come back.
 */
export async function listPlayerGuestTeamIds(playerId, homeTeamId) {
  const rows = await listPlayerGuestPlayups(playerId, homeTeamId)
  return rows.map((row) => row.team_id)
}

