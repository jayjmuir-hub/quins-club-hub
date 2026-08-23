import { supabase } from '../lib/supabase'
// Squad chat. Migration: db/migrations/20260823_squad_chat.sql.
// Plan: claude/plans/2026-08-23-squad-chat.md (phase 1).
//
// ⚠️ SCOPE IS `team_id`, AND NULL MEANS THE WHOLE CLUB — the announcements
// rule, for the announcements reason: it is the security boundary, and
// `private.notice_audience` keys on it.
//
// ⚠️ `club_id` AND `author_id` ARE NEVER SENT. A BEFORE INSERT trigger stamps
// both from the session. A reply's `team_id` is inherited from its parent by
// the same trigger, so a reply cannot be aimed at a different squad.
//
// House conventions (RESTORE.md §Data access conventions): throw on error,
// return [] not null, import no React.

const SELECT = `
  id, club_id, team_id, channel, parent_id, event_id, author_id, author_role, author_title, body, pinned,
  edited_at, deleted_at, created_at,
  author:profiles!messages_author_id_fkey(full_name)
`

/**
 * The stream for one squad (or the club when teamId is null): top-level posts
 * and their replies, oldest first — a chat reads downwards.
 *
 * ⚠️ `limit` IS ON TOP-LEVEL POSTS, NOT ROWS. The last N posts plus every
 * reply they carry. A second query, not a join: PostgREST cannot "limit the
 * parents and take all their children" in one request, and one extra
 * round-trip beats rendering the last 50 rows and losing the post they
 * answer.
 */
export async function listMessages(teamId, { limit = 50 } = {}) {
  let posts = supabase
    .from('messages')
    .select(SELECT)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  posts = teamId ? posts.eq('team_id', teamId) : posts.is('team_id', null)

  const { data: heads, error } = await posts
  if (error) throw error
  if (!heads?.length) return []

  const { data: replies, error: replyError } = await supabase
    .from('messages')
    .select(SELECT)
    .in('parent_id', heads.map((m) => m.id))
    .order('created_at', { ascending: true })
  if (replyError) throw replyError

  const byParent = new Map()
  for (const r of replies ?? []) {
    if (!byParent.has(r.parent_id)) byParent.set(r.parent_id, [])
    byParent.get(r.parent_id).push(r)
  }
  return heads
    .slice()
    .reverse()
    .map((m) => ({ ...m, replies: byParent.get(m.id) ?? [] }))
}

/**
 * Posts to a squad (teamId) or the club (null). Whether the caller MAY is the
 * database's decision — staff always; families only when the squad's
 * announce-only is off. Throws the RLS error otherwise; the screen hides the
 * composer first, from getChannelSettings() plus canEditTeam().
 */
export async function postMessage(teamId, body) {
  const text = body?.trim()
  if (!text) throw new Error('Write something first.')
  const { data, error } = await supabase
    .from('messages')
    .insert({ team_id: teamId ?? null, body: text })
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

/** Replies to a post. Allowed for anybody who can see the post. */
export async function replyToMessage(parentId, body) {
  const text = body?.trim()
  if (!text) throw new Error('Write something first.')
  const { data, error } = await supabase
    .from('messages')
    .insert({ parent_id: parentId, body: text })
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

/** Edits the body. Own row, within 15 minutes — the policy decides. */
export async function editMessage(id, body) {
  const text = body?.trim()
  if (!text) throw new Error('Write something first.')
  const { error } = await supabase.from('messages').update({ body: text }).eq('id', id)
  if (error) throw error
}

/**
 * Removes a message. A SOFT delete: the row stays, the trigger blanks the
 * body to "(removed)". Own row within 15 minutes, or squad staff.
 */
export async function removeMessage(id) {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Pins or unpins a post. Squad staff only — the policy decides. */
export async function setPinned(id, pinned) {
  const { error } = await supabase.from('messages').update({ pinned }).eq('id', id)
  if (error) throw error
}

// ── Channel settings ────────────────────────────────────────────────────────

/**
 * Whether a squad's channel is announce-only. ⚠️ ABSENT ROW = TRUE: the
 * default is on, and most squads will never have a row. Returns the whole
 * settings object (or the default) so a screen can show who changed it.
 */
export async function getChannelSettings(teamId) {
  if (!teamId) return { team_id: null, announce_only: true, updated_by: null, updated_at: null }
  const { data, error } = await supabase
    .from('channel_settings')
    .select('team_id, announce_only, updated_by, updated_at')
    .eq('team_id', teamId)
    .maybeSingle()
  if (error) throw error
  return data ?? { team_id: teamId, announce_only: true, updated_by: null, updated_at: null }
}

/** Staff only. `profileId` is the caller — the policy checks it matches. */
export async function setAnnounceOnly(teamId, clubId, profileId, announceOnly) {
  const { error } = await supabase
    .from('channel_settings')
    .upsert(
      { team_id: teamId, club_id: clubId, announce_only: announceOnly, updated_by: profileId, updated_at: new Date().toISOString() },
      { onConflict: 'team_id' },
    )
  if (error) throw error
}

// ── Read receipts ───────────────────────────────────────────────────────────

/**
 * Marks posts read. ⚠️ UPSERT THAT IGNORES DUPLICATES, AND DOES NOT THROW —
 * same reasoning as markNoticesRead: recording a read must never break the
 * screen that is showing the message.
 */
export async function markMessagesRead(profileId, messageIds) {
  if (!profileId || !messageIds?.length) return
  const rows = messageIds.map((id) => ({ message_id: id, profile_id: profileId }))
  const { error } = await supabase
    .from('message_reads')
    .upsert(rows, { onConflict: 'message_id,profile_id', ignoreDuplicates: true })
  if (error) console.warn('Could not record messages as read:', error.message)
}

/** Which posts this person has read. RLS returns only their own rows. */
export async function listMyMessageReads() {
  const { data, error } = await supabase.from('message_reads').select('message_id')
  if (error) throw error
  return new Set((data ?? []).map((r) => r.message_id))
}

/**
 * Reads-per-post for a squad, STAFF ONLY — the function returns no rows to
 * anybody else. Map of message id → { reads, audience }.
 */
export async function messageReadStats(teamId) {
  if (!teamId) return new Map()
  const { data, error } = await supabase.rpc('message_read_stats', { _team: teamId })
  if (error) throw error
  return new Map((data ?? []).map((r) => [r.message_id, { reads: Number(r.reads), audience: Number(r.audience) }]))
}

// ── Realtime ────────────────────────────────────────────────────────────────

export const MESSAGE_REALTIME_DEBOUNCE_MS = 400

let messageChannelSeq = 0

/**
 * Subscribes to changes on `messages`. Returns an unsubscribe function.
 *
 * ⚠️ NO `filter`, AS FOR subscribeNotices, AND FOR THE SAME REASON: a DELETE
 * (or a soft-delete UPDATE that only the row's id identifies) would not match
 * a team_id filter. RLS scopes delivery per subscriber. The plan's note on
 * full-refetch at scale stands — one squad's stream is one bounded query,
 * and the pilot will measure it before this widens.
 */
export function subscribeMessages(callback, { debounceMs = MESSAGE_REALTIME_DEBOUNCE_MS } = {}) {
  let timer = null
  function onChange() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      callback()
    }, debounceMs)
  }
  const channel = supabase
    .channel(`messages-changes-${++messageChannelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, onChange)
    .subscribe()

  let unsubscribed = false
  return () => {
    if (unsubscribed) return
    unsubscribed = true
    if (timer) clearTimeout(timer)
    supabase.removeChannel(channel)
  }
}
