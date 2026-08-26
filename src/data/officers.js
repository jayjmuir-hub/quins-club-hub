import { supabase } from '../lib/supabase'

// Club officers — titles without rights (claude/plans/2026-08-26-club-officers.md).
// RLS is the whole contract: any active member reads, only a super admin
// writes; this file only moves rows. The eight-title vocabulary lives in
// the table's CHECK and, for rendering order, in src/lib/identity.js's
// OFFICER_TITLES — the database refuses anything outside it.

export async function listClubOfficers() {
  const { data, error } = await supabase
    .from('club_officers')
    .select('id, club_id, profile_id, title, profile:profiles(full_name)')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addClubOfficer(clubId, profileId, title) {
  const { error } = await supabase.from('club_officers').insert({ club_id: clubId, profile_id: profileId, title })
  if (error) throw error
}

export async function removeClubOfficer(id) {
  const { error } = await supabase.from('club_officers').delete().eq('id', id)
  if (error) throw error
}
