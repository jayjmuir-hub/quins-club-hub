import { supabase } from '../lib/supabase'
import { subscribeToTable, REALTIME_DEBOUNCE_MS } from './subscribeToTable.js'
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

// ⚠️ THE QUOTED EMBED IS SPELLED `quoted:quoted_id(…)` — THE FK COLUMN
// ITSELF — AND BOTH OTHER SPELLINGS SHIPPED BROKEN, THE SAME EVENING,
// 24 Aug 2026. A SELF-join is the trap twice over:
//   1. `!messages_quoted_id_fkey` (constraint hint) → PGRST200 "Could not
//      find a relationship" on this project's PostgREST — the identical
//      probe against the weeks-old messages_parent_id_fkey fails the same
//      way, so it is the self-join, not cache staleness.
//   2. `messages!quoted_id` (table + column hint) RESOLVED — in the WRONG
//      DIRECTION: the messages-that-quote-THIS-one array, so every bubble
//      carried an empty-array "quote" and the screens drew a phantom
//      "📷 Photo" chip on every message. Jay screenshotted it live.
// Embedding via the column is defined as to-one toward the referenced row
// and cannot be read backwards. Constraint-name hints still work fine on
// ordinary embeds — profiles and events below use them.
// The embed is read under RLS as the caller — a quote of a message you may
// not read comes back null, which renders as no quote at all.
const SELECT = `
  id, club_id, team_id, channel, parent_id, event_id, author_id, author_role, author_title, author_team_id, body, pinned,
  mentions, edited_at, deleted_at, created_at, quoted_id, forwarded, attachment_path, attachments,
  author:profiles!messages_author_id_fkey(full_name),
  author_team:teams!messages_author_team_id_fkey(name),
  quoted:quoted_id(id, body, deleted_at, attachment_path, attachments, author_id, author:profiles!messages_author_id_fkey(full_name)),
  event:events!messages_event_id_fkey(id, type, title, opponent, home, starts_at, ends_at, time_tbd, venue, pitch, team_id),
  parent:parent_id(id, body, deleted_at, attachment_path, attachments, author_id, event_id, author:profiles!messages_author_id_fkey(full_name), event:events!messages_event_id_fkey(id, type, title, opponent, home, starts_at, time_tbd))
`
// `parent` (4 Sep 2026): the post a channel reply answers, embedded so the
// reply can draw its quote — the same shape `quoted` gives a DM reply. A
// channel stream is FLAT since 4 Sep 2026 (claude/decisions/2026-09-04-channel-
// threads-flat-stream.md): a reply is a message at its own time with a quote,
// not a row folded under its parent. `parent.event` is what lets the quote say
// the fixture's name instead of repeating the fixture post's empty body.

// ══ THE ONE PLACE A CLIENT DECIDES WHAT TO WRITE FOR AN ATTACHMENT ════════
//
// `messages` carries THREE attachment columns and only ONE of them is the
// truth (db/migrations/20260901_attachment_metadata.sql):
//
//   attachments      jsonb   [{ file, type, size, name }, ...]   <- WRITE THIS
//   attachment_paths text[]  derived by trigger  <- the STORAGE READ POLICY
//   attachment_path  text    derived by trigger  <- cached service workers
//
// ⚠️ Writing a derived column BESIDE the truth is how the three come to
// disagree, and a disagreement in `attachment_paths` is an invisible
// permission bug, not a cosmetic one: that array is what the
// `chat media read` policy on storage.objects matches against, so a message
// could render a photo its own audience is refused — or grant one it should
// never have carried.
//
// `attachmentPath` survives for the writers that have no album and never
// will: voice notes, and forwarding a message sent by an old cached bundle.
function attachmentColumns({ attachments = [], attachmentPath = null }) {
  if (attachments.length) return { attachments }
  return attachmentPath ? { attachment_path: attachmentPath } : {}
}

/**
 * Whether a wordless message is legal — the client half of
 * `messages_body_check`, which counts `attachments` and not the old column.
 */
function carriesAttachment(opts) {
  return Object.keys(attachmentColumns(opts)).length > 0
}

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
// ⚠️ TOMBSTONE, 4 Sep 2026. Until today each of the three channel loaders below
// fetched the newest top-level posts, then a second query for their replies,
// and nested them as `replies: [...]` under each post — the thread model from
// the first squad-chat build (#326). The screen folded those replies behind an
// 11px "N replies" toggle, and on 4 Sep a manager's reply to the second-to-last
// post in a role channel was promised by the chat list's preview and invisible
// in the chat. Jay's ruling: a reply lands at the bottom as a new message, like
// WhatsApp, with a quote of what it answers. So the stream is one query, every
// message in time order, replies included, each carrying `parent` for its
// quote. Nothing here nests any more. Do not bring `replies` back.
async function flatStream(query) {
  const { data, error } = await query
  if (error) throw error
  // Newest-first from the database (so the LIMIT keeps the recent end), oldest-
  // first for the screen, which reads downwards.
  return (data ?? []).slice().reverse()
}

export async function listMessages(teamId, { limit = 80 } = {}) {
  let q = supabase
    .from('messages')
    .select(SELECT)
    // ⚠️ THE CHANNEL FILTER IS LOAD-BEARING — 23 Aug 2026. Without it the club
    // channel (team_id null) also matched every DM (team_id null, channel dm),
    // so a member's own private messages appeared in Whole-club chat with no
    // recipient shown. Jay saw it on the live site the evening DMs shipped.
    // A reply carries its parent's channel and team_id (the insert trigger
    // copies them — measured live 4 Sep 2026, zero mismatches), so this
    // filter is right for replies too.
    .eq('channel', 'squad')
    .order('created_at', { ascending: false })
    .limit(limit)
  q = teamId ? q.eq('team_id', teamId) : q.is('team_id', null)
  return flatStream(q)
}

/**
 * Posts to a squad (teamId) or the club (null). Whether the caller MAY is the
 * database's decision — staff always; families only when the squad's
 * announce-only is off. Throws the RLS error otherwise; the screen hides the
 * composer first, from getChannelSettings() plus canEditTeam().
 */
export async function postMessage(teamId, body, { eventId = null, mentions = [], attachmentPath = null, attachments = [], forwarded = false } = {}) {
  // Round 2: a photo may travel alone — empty body is legal exactly when an
  // attachment rides along, mirroring the messages_body_check.
  const text = body?.trim() ?? ''
  if (!text && !carriesAttachment({ attachments, attachmentPath })) throw new Error('Write something first.')
  // ⚠️ A FIXTURE THREAD SENDS event_id AND NOT team_id — the trigger sets the
  // squad from the fixture and refuses a mismatch, so the client never gets
  // to say which squad a fixture belongs to. One open thread per fixture.
  const extras = {
    ...attachmentColumns({ attachments, attachmentPath }),
    ...(forwarded ? { forwarded: true } : {}),
  }
  const row = eventId
    ? { event_id: eventId, body: text, mentions, ...extras }
    : { team_id: teamId ?? null, body: text, mentions, ...extras }
  const { data, error } = await supabase.from('messages').insert(row).select(SELECT).single()
  if (error) throw error
  return data
}

/**
 * Replies to a post. Allowed for anybody who can see the post.
 * `mentions` is profile ids; the trigger drops any not in the squad.
 */
export async function replyToMessage(parentId, body, { mentions = [], attachmentPath = null, attachments = [] } = {}) {
  const text = body?.trim() ?? ''
  // 4 Sep 2026: a reply is sent from the foot composer now, so it may carry
  // the tray's photos like any other post. Same rule as postMessage.
  if (!text && !carriesAttachment({ attachments, attachmentPath })) throw new Error('Write something first.')
  const { data, error } = await supabase
    .from('messages')
    .insert({ parent_id: parentId, body: text, mentions, ...attachmentColumns({ attachments, attachmentPath }) })
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
  // ⚠️ A REAL DELETE SINCE 24 Aug 2026 — Jay: "i still can't completely delete
  // messages". Replies, read receipts and reports cascade. Who may is the
  // "message delete" policy: the author any time, staff in their channels,
  // admins where they may review; a REPORTED message only by an admin.
  // db/migrations/20260824_delete_for_good.sql.
  // ⚠️ .select() SO A ZERO-ROW DELETE IS AN ERROR, NOT A SHRUG (24 Aug
  // 2026). RLS refusing a delete comes back as success-with-no-rows, and the
  // welfare screen once reported "removed" while the message sat untouched.
  // The database was proved innocent (a rolled-back probe deleted reported
  // channel and DM messages fine); this guard is so the NEXT silent refusal
  // says so out loud instead of leaving a tester doubting their eyes.
  const { data, error } = await supabase.from('messages').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('The message was not removed — you may not have the right to, or it is already gone.')
}

/**
 * Delete a DM for good — for BOTH participants (24 Aug 2026). The policy
 * allows either participant unless a message in it has been reported, in
 * which case an admin. Messages cascade; the welfare access log survives.
 */
export async function deleteConversation(conversationId) {
  // ⚠️ .select() so a zero-row delete is an error, not a shrug — the same
  // guard removeMessage carries. RLS refusing (a reported conversation, a
  // non-participant) comes back as success-with-no-rows, and the screen would
  // otherwise navigate away claiming "deleted for both of you" while the
  // thread sat untouched.
  const { data, error } = await supabase.from('conversations').delete().eq('id', conversationId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('The conversation was not deleted — you may not have the right to, or it is already gone.')
}

/**
 * Clear a squad, staff or club channel — every post and its replies, gone.
 * Staff of the squad (admins for the club); reported posts stay. Returns the
 * number of posts deleted. `teamId` null = the club channel.
 */
export async function clearChannel(teamId, channel = 'squad') {
  const { data, error } = await supabase.rpc('clear_channel', { _team: teamId, _channel: channel })
  if (error) throw error
  return data ?? 0
}

/** Pins or unpins a post. Squad staff only — the policy decides. */
export async function setPinned(id, pinned) {
  // Round 4: through the RPC, not a table update. In a DM/group ANY
  // participant may pin (Jay's WhatsApp-default ruling); channels keep the
  // staff rule. The RPC exists because widening the messages UPDATE policy
  // would hand participants the whole granted column set — body included
  // (db/migrations/20260824_chat_round_4.sql).
  const { error } = await supabase.rpc('set_message_pinned', { _message: id, _pinned: pinned })
  if (error) throw error
}

// ── Stars: private bookmarks (round 4, the nicknames pattern) ───────────────

/** My starred message ids, as a Set. */
export async function listMyStars() {
  const { data, error } = await supabase.from('message_stars').select('message_id')
  if (error) throw error
  return new Set((data ?? []).map((r) => r.message_id))
}

/** Star or unstar for myself. `ownerId` is my id — the toggleReaction convention. */
export async function toggleStar(ownerId, messageId, on) {
  if (on) {
    const { error } = await supabase.from('message_stars').insert({ owner_id: ownerId, message_id: messageId })
    if (error) throw error
  } else {
    const { error } = await supabase.from('message_stars').delete().eq('message_id', messageId)
    if (error) throw error
  }
}

/**
 * My starred messages, newest star first, with enough of each message to
 * render a row and jump to its thread. Reads messages by id under RLS — a
 * star whose message has since gone unreadable simply drops out.
 */
export async function listMyStarredMessages() {
  const { data: stars, error } = await supabase
    .from('message_stars')
    .select('message_id, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  if (!stars?.length) return []
  const { data: rows, error: msgError } = await supabase
    .from('messages')
    .select(SELECT)
    .in('id', stars.map((s) => s.message_id))
  if (msgError) throw msgError
  const byId = new Map((rows ?? []).map((m) => [m.id, m]))
  return stars.map((s) => byId.get(s.message_id)).filter(Boolean)
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
 * How many recent messages this person has not read — the dock's Chat dot
 * (23 Aug 2026). From the last 14 days, not deleted, not their own, minus
 * their own `message_reads`. ⚠️ Replies count since 4 Sep 2026: the stream is
 * flat (claude/decisions/2026-09-04-channel-threads-flat-stream.md) and the
 * list's badge (my_chats) has counted them since 24 Aug — a dot that stayed
 * dark while the list said "1 unread" was the last trace of the fold.
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
      .is('deleted_at', null)
      .neq('author_id', profileId)
      .gte('created_at', since),
    supabase.from('message_reads').select('message_id'),
  ])
  if (posts.error) throw posts.error
  if (reads.error) throw reads.error
  const read = new Set((reads.data ?? []).map((r) => r.message_id))
  const unread = (posts.data ?? []).filter((m) => !read.has(m.id))
  // ⚠️ THE SECOND TICK RIDES ON THIS FETCH (26 Aug 2026). This function runs
  // in every signed-in tab on mount and on every realtime message event —
  // which is exactly what "delivered to their device" means, as opposed to
  // "they opened the thread" (that is message_reads). Fire-and-forget: the
  // badge count must not wait on, or fail with, the receipt write.
  markMessagesDelivered(profileId, unread.map((m) => m.id))
  return unread.length
}

/**
 * Records that this device has RECEIVED these messages — WhatsApp's second
 * tick (26 Aug 2026). Same never-throw upsert stance as markMessagesRead:
 * a receipt must never break the screen. Callers pass only ids AUTHORED BY
 * OTHERS; delivering your own message to yourself is meaningless and the
 * receipts query filters self out anyway.
 */
export async function markMessagesDelivered(profileId, messageIds) {
  if (!profileId || !messageIds?.length) return
  const rows = messageIds.map((id) => ({ message_id: id, profile_id: profileId }))
  const { error } = await supabase
    .from('message_deliveries')
    .upsert(rows, { onConflict: 'message_id,profile_id', ignoreDuplicates: true })
  if (error) console.warn('Could not record messages as delivered:', error.message)
}

/**
 * Delivery and read receipts for MESSAGES I AUTHORED — the ticks' data
 * (26 Aug 2026). RLS is what scopes this: the author arm on both tables
 * returns rows only for the caller's own messages, so passing somebody
 * else's ids yields nothing rather than an error. Map of message id →
 * { delivered: Set<profileId>, read: Set<profileId> }, with the caller's own
 * rows filtered out — reading your own message is not a receipt.
 */
export async function listMessageReceipts(selfId, messageIds) {
  const ids = [...new Set((messageIds ?? []).filter(Boolean))]
  if (!selfId || ids.length === 0) return new Map()
  const [deliveries, reads] = await Promise.all([
    supabase.from('message_deliveries').select('message_id, profile_id').in('message_id', ids),
    supabase.from('message_reads').select('message_id, profile_id').in('message_id', ids),
  ])
  if (deliveries.error) throw deliveries.error
  if (reads.error) throw reads.error
  const byId = new Map()
  const bucket = (id) => {
    if (!byId.has(id)) byId.set(id, { delivered: new Set(), read: new Set() })
    return byId.get(id)
  }
  for (const row of deliveries.data ?? []) {
    if (row.profile_id !== selfId) bucket(row.message_id).delivered.add(row.profile_id)
  }
  for (const row of reads.data ?? []) {
    if (row.profile_id !== selfId) {
      const b = bucket(row.message_id)
      b.read.add(row.profile_id)
      // A read implies the device had it, even if the delivery upsert lost
      // a race — the ticks must never show read without delivered.
      b.delivered.add(row.profile_id)
    }
  }
  return byId
}

/**
 * Which tick a message of mine shows. `recipients` is everyone in the chat
 * but me; WhatsApp's rule is ALL of them: one member of a group reading it
 * does not make the ticks accent-coloured.
 */
export function receiptState(receipt, recipients) {
  const others = (recipients ?? []).filter(Boolean)
  if (others.length === 0) return 'sent'
  if (receipt && others.every((id) => receipt.read.has(id))) return 'read'
  if (receipt && others.every((id) => receipt.delivered.has(id))) return 'delivered'
  return 'sent'
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

/**
 * Subscribes to changes on `messages`. Returns an unsubscribe function.
 *
 * ⚠️ NO `filter`, AS FOR subscribeNotices, AND FOR THE SAME REASON: a DELETE
 * (or a soft-delete UPDATE that only the row's id identifies) would not match
 * a team_id filter. RLS scopes delivery per subscriber. The plan's note on
 * full-refetch at scale stands — one squad's stream is one bounded query,
 * and the pilot will measure it before this widens.
 */
export function subscribeMessages(callback, { debounceMs = REALTIME_DEBOUNCE_MS } = {}) {
  return subscribeToTable('messages', callback, { debounceMs })
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
export async function listStaffMessages(teamId, { limit = 80 } = {}) {
  if (!teamId) return []
  return flatStream(
    supabase
      .from('messages')
      .select(SELECT)
      .eq('team_id', teamId)
      .eq('channel', 'staff')
      .order('created_at', { ascending: false })
      .limit(limit),
  )
}

// ── Role channels (db/migrations/20260830_role_channels.sql) ────────────────
// Club-wide chats keyed by messages.channel — membership is derived from
// roles by private.in_role_channel, so whether the caller MAY read or post is
// entirely the policy's decision; these are plain reads/inserts.

/** The stream for one role channel, same thread shape as listMessages. */
export async function listRoleMessages(channelKey, { limit = 80 } = {}) {
  return flatStream(
    supabase.from('messages').select(SELECT).eq('channel', channelKey).order('created_at', { ascending: false }).limit(limit),
  )
}

/** Posts to a role channel. Members only — the policy decides. */
export async function postRoleMessage(channelKey, body, { mentions = [], attachmentPath = null, attachments = [], forwarded = false } = {}) {
  const text = body?.trim() ?? ''
  if (!text && !carriesAttachment({ attachments, attachmentPath })) throw new Error('Write something first.')
  const { data, error } = await supabase
    .from('messages')
    .insert({
      channel: channelKey,
      body: text,
      mentions,
      ...attachmentColumns({ attachments, attachmentPath }),
      ...(forwarded ? { forwarded: true } : {}),
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

/**
 * Who is in a channel, and why — the member sheet behind every channel
 * header. `channel` is 'squad' / 'staff' (with a team), 'club' (admins only —
 * the RPC refuses others; names are squad-scoped for everyone else), or a
 * role-channel key. Rows: { profile_id, full_name, reason }.
 */
export async function channelMembers(channel, teamId = null) {
  const { data, error } = await supabase.rpc('channel_members', { _channel: channel, _team: teamId })
  if (error) throw error
  return data ?? []
}

/** Posts to the squad's staff channel. Staff only — the policy decides. */
export async function postStaffMessage(teamId, body, { mentions = [], attachmentPath = null, attachments = [], forwarded = false } = {}) {
  const text = body?.trim() ?? ''
  if (!text && !carriesAttachment({ attachments, attachmentPath })) throw new Error('Write something first.')
  const { data, error } = await supabase
    .from('messages')
    .insert({
      team_id: teamId,
      channel: 'staff',
      body: text,
      mentions,
      ...attachmentColumns({ attachments, attachmentPath }),
      ...(forwarded ? { forwarded: true } : {}),
    })
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
      .select('id, club_id, kind, title, profile_a, profile_b, created_at, last_at')
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

/**
 * Sends a DM or group message. The trigger re-checks can_dm on every message.
 * Round 2: `quotedId` is a reply-with-quote (the guard trigger refuses a
 * quote from outside this conversation); `attachmentPath` is a chat-media
 * key already uploaded (photo-first, WhatsApp order), and lets the body be
 * empty; `forwarded` marks a passed-along message.
 */
export async function sendDirectMessage(conversationId, body, { quotedId = null, attachmentPath = null, attachments = [], forwarded = false, mentions = [] } = {}) {
  const text = body?.trim() ?? ''
  if (!text && !carriesAttachment({ attachments, attachmentPath })) throw new Error('Write something first.')
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      body: text,
      ...(quotedId ? { quoted_id: quotedId } : {}),
      ...attachmentColumns({ attachments, attachmentPath }),
      ...(forwarded ? { forwarded: true } : {}),
      // Groups only — the trigger keeps members, zeroes 1:1 DMs
      // (db/migrations/20260831_group_chat_mentions.sql). Absent when empty,
      // like the round-2 options above.
      ...(mentions.length ? { mentions } : {}),
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

/**
 * Forwards messages into one of my chats — the round-2 "click to add to
 * forward multiple". `dest` is a my_chats row (kind dm/group/staff/squad/
 * club); each message goes through the SAME send path a typed one takes, so
 * can_dm, announce-only and blocks all apply and refuse identically.
 * Oldest first, so the destination reads in the original order. A photo
 * forwards by re-pointing at the same object — the storage read policy
 * follows the message, so the destination's audience can see it.
 */
export async function forwardMessagesTo(dest, msgs) {
  const ordered = msgs.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  for (const m of ordered) {
    // ⚠️ THE WHOLE ALBUM, not attachment_path — that column is the FIRST
    // key only, so forwarding by it would silently drop every photo after
    // the first the moment an album could be sent at all. `attachments` is
    // absent on a message loaded by an old cached bundle, hence the fallback.
    const opts = {
      attachments: m.attachments ?? [],
      attachmentPath: m.attachment_path ?? null,
      forwarded: true,
    }
    if (dest.kind === 'dm' || dest.kind === 'group') {
      await sendDirectMessage(dest.conversation_id, m.body, opts)
    } else if (dest.kind === 'staff') {
      await postStaffMessage(dest.team_id, m.body, opts)
    } else {
      await postMessage(dest.team_id ?? null, m.body, opts)
    }
  }
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
        'message:messages!message_reports_message_id_fkey(id, body, channel, team_id, conversation_id, author_id, deleted_at, attachment_path, attachments, author:profiles!messages_author_id_fkey(full_name)), ' +
        'reporter:profiles!message_reports_reporter_id_fkey(full_name)',
    )
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function resolveReport(reportId) {
  // ⚠️ .select() so a zero-row update is an error, not a shrug — RLS refusing
  // (since 30 Aug a DM/group report needs the welfare grant) comes back as
  // success-with-no-rows, and the screen would tick the report off while it
  // stayed open.
  const { data, error } = await supabase
    .from('message_reports')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', reportId)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('The report was not resolved — you may not have the right to.')
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

// ── The Chats list (24 Aug 2026) ────────────────────────────────────────────
//
// Jay: "make it more like whatsapp". One list of everything I am in — squad
// channels, staff channels, the club, DMs — newest first, with unread counts.
// Scope is the database's (public.my_chats uses the same helpers as the
// policies), so nothing here can list a chat the reader could not open.

/**
 * @returns rows of { kind: 'squad'|'staff'|'club'|'dm', team_id, conversation_id,
 *   label, detail, last_at, last_body, last_author_id, last_author_name, unread }
 */
export async function listChats() {
  const { data, error } = await supabase.rpc('my_chats')
  if (error) throw error
  return data ?? []
}

/** The route a list row opens. */
export function chatPath(row) {
  switch (row.kind) {
    case 'group':
    case 'dm':
      return `/chat/dm/${row.conversation_id}`
    case 'club':
      return '/chat/club'
    case 'staff':
      return `/chat/${row.team_id}?channel=staff`
    // Role channels (20260830): the kind IS the route param, like 'club'.
    case 'headcoaches':
    case 'managers':
    case 'medics':
    case 'welfare':
    case 'clubstaff':
    case 'committee':
      return `/chat/${row.kind}`
    default:
      return `/chat/${row.team_id}`
  }
}

/**
 * Clear a DM for ME only (hide the past; the other side keeps theirs). Built
 * 24 Aug 2026 and superseded the same evening by deleteConversation — Jay:
 * "completely". Kept because the function is live; nothing in the app calls it.
 */
export async function clearConversation(conversationId) {
  const { error } = await supabase.rpc('clear_conversation', { _conversation: conversationId })
  if (error) throw error
}

// ── Groups (claude/plans/2026-08-24-group-chats.md) ─────────────────────────

export async function createGroup(title, memberIds) {
  const { data, error } = await supabase.rpc('create_group', { _title: title, _members: memberIds })
  if (error) throw error
  return data
}

export async function renameGroup(conversationId, title) {
  const { error } = await supabase.from('conversations').update({ title }).eq('id', conversationId)
  if (error) throw error
}

export async function addGroupMembers(conversationId, memberIds) {
  const { error } = await supabase.rpc('add_group_members', { _conversation: conversationId, _members: memberIds })
  if (error) throw error
}

export async function leaveGroup(conversationId) {
  const { error } = await supabase.rpc('leave_group', { _conversation: conversationId })
  if (error) throw error
}

export async function removeGroupMember(conversationId, memberId) {
  const { error } = await supabase.rpc('remove_group_member', { _conversation: conversationId, _member: memberId })
  if (error) throw error
}

export async function listGroupMembers(conversationId) {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('profile_id, is_owner, joined_at, profiles(full_name)')
    .eq('conversation_id', conversationId)
    .order('joined_at')
  if (error) throw error
  return (data ?? []).map((r) => ({
    profile_id: r.profile_id,
    is_owner: r.is_owner,
    full_name: r.profiles?.full_name ?? '',
  }))
}

// ── Emoji reactions (db/migrations/20260824_message_reactions.sql) ──────────

/** rows for a set of messages, grouped: Map<message_id, [{profile_id, emoji}]> */
export async function listReactions(messageIds) {
  if (!messageIds?.length) return new Map()
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, profile_id, emoji')
    .in('message_id', messageIds)
  if (error) throw error
  const map = new Map()
  for (const r of data ?? []) {
    if (!map.has(r.message_id)) map.set(r.message_id, [])
    map.get(r.message_id).push(r)
  }
  return map
}

/** Toggle my reaction. A racing double-add (23505) is the state we wanted. */
export async function toggleReaction(messageId, profileId, emoji, on) {
  if (on) {
    const { error } = await supabase.from('message_reactions').insert({ message_id: messageId, profile_id: profileId, emoji })
    if (error && error.code !== '23505') throw error
  } else {
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .match({ message_id: messageId, profile_id: profileId, emoji })
    if (error) throw error
  }
}

/** Same shape as subscribeMessages, for the reactions table. */
export function subscribeReactions(callback, { debounceMs = REALTIME_DEBOUNCE_MS } = {}) {
  return subscribeToTable('message_reactions', callback, {
    debounceMs,
    channelPrefix: 'reaction-changes',
  })
}

// The group picker's pool: like listDmCandidates but without the minor gate,
// which is the 24 Aug ruling, not an accident.
export async function listGroupCandidates() {
  const { data, error } = await supabase.rpc('group_candidates')
  if (error) throw error
  return data ?? []
}
