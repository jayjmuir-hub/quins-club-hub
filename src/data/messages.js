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
    // ⚠️ THE CHANNEL FILTER IS LOAD-BEARING — 23 Aug 2026. Without it the club
    // channel (team_id null) also matched every DM (team_id null, channel dm),
    // so a member's own private messages appeared in Whole-club chat with no
    // recipient shown. Jay saw it on the live site the evening DMs shipped.
    .eq('channel', 'squad')
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

// ── Phase 3: the staff channel, direct messages, reports ───────────────────
//
// ⚠️ THE RULING (Jay, 23 Aug 2026): ANY CLUB ADMIN CAN READ A DM. The
// permanent notice in every DM says so. `welfare` is an admin RIGHT that
// decides who sees the Welfare dashboard; it is not a data permission.
// db/migrations/20260823_squad_chat_phase3.sql carries the whole rule for
// who may message whom — private.can_dm — and the client never re-derives
// it: dm_candidates() is the list, open_conversation() is the door.

/**
 * The squad's STAFF channel stream. Same shape as listMessages; the policy
 * decides who may read it (coach / manager / medic of the squad, or admin).
 */
export async function listStaffMessages(teamId, { limit = 50 } = {}) {
  if (!teamId) return []
  const { data: heads, error } = await supabase
    .from('messages')
    .select(SELECT)
    .eq('team_id', teamId)
    .eq('channel', 'staff')
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(limit)
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
  return heads.slice().reverse().map((m) => ({ ...m, replies: byParent.get(m.id) ?? [] }))
}

/** Posts to the squad's staff channel. Staff only — the policy decides. */
export async function postStaffMessage(teamId, body, { mentions = [] } = {}) {
  const text = body?.trim()
  if (!text) throw new Error('Write something first.')
  const { data, error } = await supabase
    .from('messages')
    .insert({ team_id: teamId, channel: 'staff', body: text, mentions })
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

/** Who can be @mentioned in a channel: 'squad' (default) or 'staff'. */
export async function listMentionablesFor(teamId, channel = 'squad') {
  const { data, error } = await supabase.rpc('chat_mentionables', { _team: teamId ?? null, _channel: channel })
  if (error) throw error
  return data ?? []
}

/** The people I may start a DM with. The database's list, never the club's. */
export async function listDmCandidates() {
  const { data, error } = await supabase.rpc('dm_candidates')
  if (error) throw error
  return data ?? []
}

/** Find-or-create the conversation with somebody. Throws if can_dm says no. */
export async function openConversation(otherId) {
  const { data, error } = await supabase.rpc('open_conversation', { _other: otherId })
  if (error) throw error
  return data
}

/** My inbox: conversations, newest activity first, with unread flags. */
export async function listMyConversations() {
  const { data, error } = await supabase.rpc('my_conversations')
  if (error) throw error
  return data ?? []
}

/** One conversation row (participants), for the thread header. RLS scopes it. */
export async function getConversation(conversationId) {
  const [{ data, error }, minor] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, club_id, profile_a, profile_b, created_at, last_at')
      .eq('id', conversationId)
      .maybeSingle(),
    // Whether a minor is in it decides the notice: a minor's conversation is
    // reviewable by admins from the first message; an adults-only one only
    // once a message in it is reported (Jay, 23 Aug 2026). null for anyone
    // who may not see it. db/migrations/20260823_adult_dms_private.sql.
    supabase.rpc('conversation_involves_minor', { _conversation: conversationId }),
  ])
  if (error) throw error
  if (minor.error) throw minor.error
  return data ? { ...data, involves_minor: minor.data === true } : data
}

/** A DM thread, oldest first. */
export async function listDirectMessages(conversationId, { limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('messages')
    .select(SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

/** Sends a DM. The trigger re-checks can_dm on every message. */
export async function sendDirectMessage(conversationId, body) {
  const text = body?.trim()
  if (!text) throw new Error('Write something first.')
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, body: text })
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

/**
 * An admin opening a DM they are not part of. Records the open; the
 * function returns silently for a participant. Never throws on a log
 * failure: the review still happens, and the log is the thing to fix.
 */
export async function logWelfareAccess(conversationId) {
  const { error } = await supabase.rpc('log_welfare_access', { _conversation: conversationId })
  if (error) console.warn('Could not log welfare access:', error.message)
}

/** Block / unblock somebody from messaging me. Own rows only. */
export async function blockDm(otherId) {
  const { error } = await supabase.from('dm_blocks').insert({ blocked_id: otherId })
  if (error && error.code !== '23505') throw error
}
export async function unblockDm(otherId) {
  const { error } = await supabase.from('dm_blocks').delete().eq('blocked_id', otherId)
  if (error) throw error
}
export async function listMyBlocks() {
  const { data, error } = await supabase.from('dm_blocks').select('blocked_id')
  if (error) throw error
  return new Set((data ?? []).map((r) => r.blocked_id))
}

/** Report a message. Anyone who can see it. club_id and reporter are stamped. */
export async function reportMessage(messageId, reason) {
  const text = reason?.trim()
  if (!text) throw new Error('Say what is wrong with it.')
  const { error } = await supabase.from('message_reports').insert({ message_id: messageId, reason: text })
  if (error) throw error
}

/** Open reports, admins only. */
export async function listOpenReports() {
  const { data, error } = await supabase
    .from('message_reports')
    .select(
      'id, message_id, reporter_id, reason, created_at, ' +
        'message:messages!message_reports_message_id_fkey(id, body, channel, team_id, conversation_id, author_id, deleted_at, author:profiles!messages_author_id_fkey(full_name)), ' +
        'reporter:profiles!message_reports_reporter_id_fkey(full_name)',
    )
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function resolveReport(reportId) {
  const { error } = await supabase
    .from('message_reports')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', reportId)
  if (error) throw error
}

/** The Welfare dashboard rows. Admins only; the function returns nothing to anybody else. */
export async function welfareOverview() {
  const { data, error } = await supabase.rpc('welfare_overview')
  if (error) throw error
  return data ?? []
}

/** The access log, newest first. Admins only. */
export async function listWelfareAccessLog({ limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('welfare_access_log')
    .select('id, opened_at, conversation_id, admin:profiles!welfare_access_log_admin_id_fkey(full_name)')
    .order('opened_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

/**
 * A guardian (or admin) consenting to a U16+ player being messaged by
 * their squad coach or manager. The trigger refuses the player themself
 * and records who and when.
 */
export async function setStaffDmOptIn(playerId, optIn) {
  const { error } = await supabase
    .from('player_private')
    .update({ staff_dm_opt_in: optIn })
    .eq('player_id', playerId)
  if (error) throw error
}
