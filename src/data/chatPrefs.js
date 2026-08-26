import { supabase } from '../lib/supabase'

// Pinned chats and archive — round 6 (db/migrations/20260824_chat_prefs.sql).
// Since 26 Aug 2026 also the wallpaper (db/migrations/20260826_chat_background.sql):
// per-chat, per-person, so a pick follows you to every device.
// Owner-only by RLS: these calls only ever see and write the caller's own
// preferences, which is the whole design — your pins, your archive and your
// wallpaper are the shape of YOUR list and YOUR thread, invisible to
// everyone else.
//
// `chatKey` is the list's own row key ('<kind>-<team or conversation id>',
// 'club-club' for the club channel) — see rowKey in ChatList.jsx.

/** My preferences, as a Map(chat_key → {pinned, archived, background}). */
export async function listMyChatPrefs() {
  const { data, error } = await supabase.from('chat_prefs').select('chat_key, pinned, archived, background')
  if (error) throw error
  return new Map(
    (data ?? []).map((r) => [r.chat_key, { pinned: r.pinned, archived: r.archived, background: r.background }]),
  )
}

/** My preference row for ONE chat, or null — the thread hooks' wallpaper read. */
export async function getMyChatPref(chatKey) {
  const { data, error } = await supabase
    .from('chat_prefs')
    .select('pinned, archived, background')
    .eq('chat_key', chatKey)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

/**
 * Set one flag on one chat. Upsert keyed (owner, chat_key); a row with both
 * flags false is left in place — a no-op row only its owner can see.
 * `ownerId` is my id from useAuth, the toggleReaction convention.
 */
export async function setChatPref(ownerId, chatKey, patch) {
  const { data: existing, error: readError } = await supabase
    .from('chat_prefs')
    .select('pinned, archived, background')
    .eq('chat_key', chatKey)
    .maybeSingle()
  if (readError) throw readError
  const next = { pinned: false, archived: false, background: null, ...existing, ...patch }
  const { error } = await supabase
    .from('chat_prefs')
    .upsert({ owner_id: ownerId, chat_key: chatKey, ...next, updated_at: new Date().toISOString() })
  if (error) throw error
}
