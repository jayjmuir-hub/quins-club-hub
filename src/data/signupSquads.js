import { supabase } from '../lib/supabase'

// Age-group list for the PRE-SIGNUP wizard. There is no session yet, so the
// ordinary `from('teams')` read is empty — `team read` is
// `auth.uid() IS NOT NULL`. public.list_signup_squads is SECURITY DEFINER
// and returns names only (no club_id). Team names are not sensitive; the
// same list is what RequestAccess already shows a signed-in stranger.

export async function listSignupSquads() {
  const { data, error } = await supabase.rpc('list_signup_squads')
  if (error) throw error
  return data ?? []
}
