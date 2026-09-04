import { supabase } from '../lib/supabase'

// U18 call-ups — claude/plans/2026-09-02-senior-squads.md Part 3, built 4 Sep
// 2026 (db/migrations/20260906_callups.sql).
//
// ⚠️ EVERY WRITE IS AN RPC. callup_requests has no write policy at all: the
// senior staff ask through request_callup, the family answers through
// answer_callup, the senior staff or an admin end through end_callup. Each
// function checks its own caller; this module only carries the call.
//
// ⚠️ THE LIST IS A FUNCTION, NOT A ROSTER READ. callup_candidates returns
// name, home squad and state for players old enough — the birthday is read
// inside the database and never comes back.

// The database's own refusals are written for people ("Only the player's
// family can answer a call-up."), so they are shown as they are; anything
// else gets the screen's fallback. Not the raw-with-fallback shape the
// friendly-error sweep forbids: a refusal is a sentence, not a stack.
function refused(error, fallback) {
  const isRefusal = error?.code === '42501' || error?.code === '22023'
  if (isRefusal && error.message) return new Error(error.message)
  return new Error(fallback)
}

/** U18 players a senior squad's staff may call up, with each one's state. */
export async function listCallupCandidates(seniorTeamId) {
  const { data, error } = await supabase.rpc('callup_candidates', { _senior_team: seniorTeamId })
  if (error) throw refused(error, 'Only the senior squad’s staff can see who they may call up.')
  return data ?? []
}

export async function requestCallup(playerId, seniorTeamId) {
  const { data, error } = await supabase.rpc('request_callup', { _player: playerId, _senior_team: seniorTeamId })
  if (error) throw refused(error, 'The call-up could not be requested.')
  return data
}

export async function answerCallup(requestId, yes) {
  const { data, error } = await supabase.rpc('answer_callup', { _request: requestId, _yes: yes === true })
  if (error) throw refused(error, 'Only the player’s family can answer a call-up.')
  return data
}

export async function endCallup(requestId) {
  const { data, error } = await supabase.rpc('end_callup', { _request: requestId })
  if (error) throw refused(error, 'Only the senior squad’s staff or an admin can end a call-up.')
  return data
}

/**
 * Every request the caller may see (RLS: their own children's, their senior
 * squad's, their home squad's, or all for an admin), newest first, with the
 * player's and both squads' names.
 */
export async function listCallups() {
  const { data, error } = await supabase
    .from('callup_requests')
    .select(
      'id, club_id, player_id, home_team_id, senior_team_id, requested_by, status, created_at, decided_at, ' +
        'players(full_name), home:teams!callup_requests_home_team_id_fkey(name), senior:teams!callup_requests_senior_team_id_fkey(name)',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getClubSettings(clubId) {
  const { data, error } = await supabase
    .from('club_settings')
    .select('club_id, senior_callup_min_age')
    .eq('club_id', clubId)
    .maybeSingle()
  if (error) throw error
  return data ?? { club_id: clubId, senior_callup_min_age: 17 }
}

export async function setCallupMinAge(clubId, age) {
  const { error } = await supabase
    .from('club_settings')
    .upsert({ club_id: clubId, senior_callup_min_age: Number(age), updated_at: new Date().toISOString() })
  if (error) throw refused(error, 'Only a club admin can change the call-up age.')
}
