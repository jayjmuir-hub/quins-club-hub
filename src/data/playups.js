import { supabase } from '../lib/supabase'

// Junior play-up — a super admin twins a junior's active home memberships
// onto a second junior age group. Same guest-membership model as senior
// call-ups (db/migrations/20260906_callups.sql), without a consent request.
// Home stays players.team_id; the guest squad sees them via listPlayers
// guest_of. Writes go through add_junior_playup / remove_junior_playup.

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

/**
 * Distinct team ids this player holds an active membership in, other than
 * their home squad. Used by the super-admin Age groups block; RLS still
 * decides which membership rows come back.
 */
export async function listPlayerGuestTeamIds(playerId, homeTeamId) {
  if (!playerId) return []
  let query = supabase
    .from('memberships')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
  if (homeTeamId) query = query.neq('team_id', homeTeamId)
  const { data, error } = await query
  if (error) throw error
  return [...new Set((data ?? []).map((row) => row.team_id).filter(Boolean))]
}
