import { supabase } from '../lib/supabase'

// public.member_identity — every hat an account wears, one row per active
// membership, visible to any active member of the same club. Identity only:
// the function has no contact column, so nothing here can leak one
// (claude/plans/2026-08-26-dm-identity-rows.md).
export async function getMemberIdentity(profileId) {
  if (!profileId) return []
  const { data, error } = await supabase.rpc('member_identity', { _profile: profileId })
  if (error) throw error
  return data ?? []
}
