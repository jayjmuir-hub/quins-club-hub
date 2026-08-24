import { supabase } from '../lib/supabase'

// Private nicknames — round 3 (db/migrations/20260824_nicknames.sql).
// Owner-only by RLS: these calls can only ever see and write the caller's
// own labels, which is the entire design — nobody else sees your names
// for people (claude/plans/2026-08-24-chat-round-3-design.md).

/** My labels, as a Map(profile_id → label). */
export async function listMyNicknames() {
  const { data, error } = await supabase.from('nicknames').select('profile_id, label')
  if (error) throw error
  return new Map((data ?? []).map((r) => [r.profile_id, r.label]))
}

/**
 * Set (upsert) or clear my label for somebody. An empty label is a clear —
 * the row goes, and their real name comes back everywhere. `ownerId` is the
 * caller's own id from useAuth, the toggleReaction convention; RLS refuses
 * any other value anyway.
 */
export async function setNickname(ownerId, profileId, label) {
  const text = label?.trim()
  if (!text) {
    const { error } = await supabase.from('nicknames').delete().eq('profile_id', profileId)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('nicknames')
    .upsert({ owner_id: ownerId, profile_id: profileId, label: text })
  if (error) throw error
}
