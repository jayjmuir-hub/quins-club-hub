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
  mentions, edited_at, deleted_at, created_at,
  author:profiles!messages_author_id_fkey(full_name),
  event:events!messages_event_id_fkey(id, type, title, opponent, home, starts_at, ends_at, time_tbd, venue, pitch, team_id)
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
export async function postMessage(teamId, body, { eventId = null, mentions = [] } = {}) {
  const text = body?.trim()
  if (!text) throw new Error('Write something first.')
  // ⚠️ A FIXTURE THREAD SENDS event_id AND NOT team_id — the trigger sets the
  // squad from the fixture and refuses a mismatch, so the client never gets
  // to say which squad a fixture belongs to. One open thread per fixture.
  const row = eventId
    ? { event_id: eventId, body: text, mentions }
    : { team_id: teamId ?? null, body: text, mentions }
  const { data, error } = await supabase.from('messages').insert(row).select(SELECT).single()
  if (error) throw error
  return data
}

/**
 * Replies to a post. Allowed for anybody who can see the post.
 * `mentions` is profile ids; the trigger drops any not in the squad.
 */
export async function replyToMessage(parentId, body, { mentions = [] } = {}) {
  const text = body?.trim()
  if (!text) throw new Error('Write something first.')
  const { data, error } = await supabase
    .from('messages')
    .insert({ parent_id: parentId, body: text, mentions })
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

/**
 * Who can be @mentioned in this channel: the squad's audience, with the
 * best role each holds, minus the caller. Staff-ness for the picker's pill.
 */
export async function listMentionables(teamId) {
  const { data, error } = await supabase.rpc('chat_mentionables', { _team: teamId ?? null })
  if (error) throw error
  return data ?? []
}

/**
 * The open thread for a fixture, if any, with its reply count. For the
 * event screen's "Squad chat" block. Null when none.
 */
export async function getEventThread(eventId) {
  if (!eventId) return null
  const { data, error } = await supabase
    .from('messages')
    .select('id, team_id, created_at, author:profiles!messages_author_id_fkey(full_name)')
    .eq('event_id', eventId)
    .is('parent_id', null)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const { count, error: countError } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', data.id)
    .is('deleted_at', null)
  if (countError) throw countError
  return { ...data, replies: count ?? 0 }
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

/**
 * How many recent posts this person has not read — the dock's Chat dot
 * (23 Aug 2026). Head posts only (replies ride under their head), from the
 * last 14 days, not deleted, not their own, minus their own `message_reads`.
 *
 * ⚠️ BOUNDED ON PURPOSE. At a full club this is fifteen squads' worth of
 * posts, and "everything you have ever not read" is both unbounded and
 * meaningless as a dot — a parent who joined today has not read any of it.
 * Two weeks is the window a dot can honestly mean "new". Ids only; RLS
 * scopes which squads' posts come back, exactly as it does for the screen.
 */
export async function countUnreadMessages(profileId) {
  if (!profileId) return 0
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const [posts, reads] = await Promise.all([
    supabase
      .from('messages')
      .select('id')
      .is('parent_id', null)
      .is('deleted_at', null)
      .neq('author_id', profileId)
      .gte('created_at', since),
    supabase.from('message_reads').select('message_id'),
  ])
  if (posts.error) throw posts.error
  if (reads.error) throw reads.error
  const read = new Set((reads.data ?? []).map((r) => r.message_id))
  return (posts.data ?? []).filter((m) => !read.has(m.id)).length
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
