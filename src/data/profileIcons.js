import { supabase } from '../lib/supabase.js'

// Profile icons (claude/plans/2026-08-31-profile-icons.md). Reads are the
// two RPCs; writes go straight at the table — RLS refuses everyone but a
// super admin of the same club (db/tests/profile-icons.sql watches that
// door). The icon value is a KEY; emoji and meanings live in
// src/lib/profileIcons.js.

/** The whole club's primary icons in one call: Map<profile_id, icon key>. */
export async function listClubIconMap() {
  const { data, error } = await supabase.rpc('club_icon_map')
  if (error) throw error
  return new Map((data ?? []).map((r) => [r.profile_id, r.icon]))
}

/** One person's full list for the person card, newest/primary first. */
export async function listMemberIcons(profileId) {
  const { data, error } = await supabase.rpc('member_icons', { _profile: profileId })
  if (error) throw error
  return data ?? []
}

/** Every grant with its target names, for the admin screen. Newest first. */
export async function listIconGrants() {
  const { data, error } = await supabase
    .from('profile_icons')
    // ⚠️ Two FKs point at profiles (profile_id and granted_by) — the embed
    // must name its COLUMN or PostgREST refuses the ambiguity (PGRST201).
    .select('id, icon, reason, is_primary, profile_id, team_id, created_at, profiles!profile_id(full_name), teams(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Grant an icon to a squad's staff (teamId) OR a person (profileId) —
 * exactly one; the table's check refuses both. A blank reason stays absent
 * so the library's default meaning shows.
 */
export async function grantIcon({ clubId, teamId = null, profileId = null, icon, reason = '' }) {
  const line = reason?.trim() ?? ''
  const { error } = await supabase.from('profile_icons').insert({
    club_id: clubId,
    ...(teamId ? { team_id: teamId } : {}),
    ...(profileId ? { profile_id: profileId } : {}),
    icon,
    ...(line ? { reason: line } : {}),
  })
  if (error) throw error
}

export async function revokeIcon(id) {
  const { error } = await supabase.from('profile_icons').delete().eq('id', id)
  if (error) throw error
}

export async function setPrimaryIcon(id) {
  const { error } = await supabase.from('profile_icons').update({ is_primary: true }).eq('id', id)
  if (error) throw error
}
