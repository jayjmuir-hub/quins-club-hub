// Harness stub for src/data/messages.js. The alias in vite.config.js matches
// the SPECIFIER `../data/messages.js`, so it catches every importer of the
// real module: the shell (src/lib/useDockBadges.js), EventDetail (the
// fixture thread) and the Chat screen. Everything the real module exports is
// here, as empty-but-well-typed answers, so a scenario that reaches any of
// them renders its empty state rather than crashing at import — the
// "does not provide an export" error is a blank page with nothing in the
// server log (23 Aug 2026). Nothing here talks to Supabase.

// A fixed 2, so every scenario shows the dock's Chat dot in its lit state.
export async function countUnreadMessages() {
  return 2
}
export function subscribeMessages() {
  return () => {}
}
export const MESSAGE_REALTIME_DEBOUNCE_MS = 400

export async function listMessages() {
  return []
}
export async function postMessage() {
  throw new Error('harness: postMessage is not stubbed')
}
export async function replyToMessage() {
  throw new Error('harness: replyToMessage is not stubbed')
}
export async function listMentionables() {
  return []
}
export async function getEventThread() {
  return null
}
export async function editMessage() {
  throw new Error('harness: editMessage is not stubbed')
}
export async function removeMessage() {}
export async function setPinned() {}
export async function getChannelSettings() {
  return { announce_only: true }
}
export async function setAnnounceOnly() {}
export async function markMessagesRead() {}
export async function listMyMessageReads() {
  // Every DM in the thread fixture is already read — the dm-thread scenario
  // measures the open-scroll, not the New divider.
  return new Set(Array.from({ length: 16 }, (_, i) => `hz-dm-${i + 1}`))
}
export async function messageReadStats() {
  return new Map()
}

// Phase 3 (23 Aug 2026): the staff channel, DMs, reports, welfare. Empty
// answers, so a scenario that reaches them renders its empty state.
export async function listStaffMessages() {
  return []
}
export async function postStaffMessage() {
  throw new Error('harness: postStaffMessage is not stubbed')
}
// Role channels (20260830).
export async function listRoleMessages() {
  return []
}
export async function postRoleMessage() {
  throw new Error('harness: postRoleMessage is not stubbed')
}
export async function channelMembers() {
  return []
}
export async function listMentionablesFor() {
  return []
}
export async function listDmCandidates() {
  return []
}
export async function openConversation() {
  throw new Error('harness: openConversation is not stubbed')
}
// Round 2 (claude/plans/2026-08-24-chat-round-2.md): the thread screens
// import these; a missing export is a blank page (see the note up top).
export async function forwardMessagesTo() {
  throw new Error('harness: forwardMessagesTo is not stubbed')
}
// Round 4 (claude/plans/2026-08-24-chat-round-4.md): stars.
export async function listMyStars() {
  return new Set()
}
export async function toggleStar() {}
export async function listMyStarredMessages() {
  return []
}
// ── The DM thread (25 Aug 2026) ────────────────────────────────────────────
// The instrument for "still when i open a chat i have to scroll down": a
// long thread whose PHOTOS sign late (stubs/chatMedia.js), so the page
// grows well after the open-scroll fires — the shape of Jay's kit-photo
// thread. Invented people only — CLAUDE.md rule 9. All messages are READ
// (Jay: "all are old and read already"), so the New divider stays out of
// the measurement.
const DM_SELF = 'harness-user'
const DM_OTHER = 'hz-sam'
const DM_CONV = {
  id: 'hz-conv-1',
  club_id: '00000000-0000-0000-0000-0000000000ad',
  kind: 'dm',
  profile_a: DM_SELF < DM_OTHER ? DM_SELF : DM_OTHER,
  profile_b: DM_SELF < DM_OTHER ? DM_OTHER : DM_SELF,
}
// ?dmCount=N shortens the thread — the wallpaper-fills-the-screen checks
// (26 Aug 2026) need a thread SHORTER than the viewport, which 16 never is.
const DM_COUNT = Math.min(16, Math.max(1,
  Number(new URLSearchParams(globalThis.location?.search ?? '').get('dmCount')) || 16))
// ⚠️ INVENTED NAMES, INVENTED CAPTIONS, INVENTED KEYS — always. These stubs
// render to PNGs that reach parent-facing guides, and that route is how a
// member's name and a child's address were published in August 2026.
//
// The ALBUM row (1 Sep 2026, plan 2 of the chat-albums series): one message
// carrying three photos, so the composer work has something shaped like its
// own output to look at. ⚠️ It renders as ONE photo today — attachment_path
// is the first key only, and the album GRID is plan 3. That gap is
// deliberate, and visible here on purpose.
const ALBUM_AT = 12
const albumFor = (i) =>
  i === ALBUM_AT
    ? [
        { file: `hz/kit-${i}.jpg`, type: 'image/jpeg', size: 184320, name: 'Home shirt.jpg' },
        { file: `hz/kit-${i}-b.jpg`, type: 'image/jpeg', size: 201728, name: 'Away shirt.jpg' },
        { file: `hz/kit-${i}-c.jpg`, type: 'image/jpeg', size: 176128, name: 'Socks.jpg' },
      ]
    : i >= 10 && i % 2 === 0
      ? [{ file: `hz/kit-${i}.jpg`, type: 'image/jpeg', size: 190464, name: `Kit option ${i / 2 - 4}.jpg` }]
      : []

const DM_ROWS = Array.from({ length: DM_COUNT }, (_, i) => {
  const mine = i % 3 === 2
  const attachments = albumFor(i)
  return {
    id: `hz-dm-${i + 1}`,
    conversation_id: 'hz-conv-1',
    channel: 'dm',
    author_id: mine ? DM_SELF : DM_OTHER,
    body:
      i === ALBUM_AT
        ? 'Three kit options — which do you prefer?'
        : i >= 10 && i % 2 === 0
          ? `Kit option ${i / 2 - 4} attached`
          : `Message ${i + 1} — logistics for Saturday.`,
    created_at: new Date(Date.now() - (16 - i) * 7 * 60000).toISOString(),
    deleted_at: null,
    quoted_id: null,
    quoted: null,
    forwarded: false,
    pinned: false,
    // The database derives these two from `attachments`
    // (private.sync_attachment_paths). Mirrored here so a fixture cannot
    // show a shape the real thing never produces.
    attachments,
    attachment_paths: attachments.map((a) => a.file),
    attachment_path: attachments[0]?.file ?? null,
    author: { full_name: mine ? 'You' : 'Sam Quillon' },
  }
})
export async function listMyConversations() {
  return [
    { conversation_id: 'hz-conv-1', other_id: DM_OTHER, other_name: 'Sam Quillon', other_role: 'manager', last_at: DM_ROWS.at(-1).created_at, last_body: DM_ROWS.at(-1).body, last_author_id: DM_ROWS.at(-1).author_id, unread: false },
  ]
}
export async function getConversation(conversationId) {
  return conversationId === 'hz-conv-1' ? DM_CONV : null
}
export async function listDirectMessages(conversationId) {
  if (conversationId !== 'hz-conv-1') return []
  // ?few=1 — the SHORT thread, for the layout instruments: Jay's 26 Aug
  // screenshot bug (a wallpaper patch over three bubbles, bare surface
  // above) only exists when the thread is shorter than the viewport, which
  // the full DM_ROWS never is.
  if (new URLSearchParams(window.location.search).get('few')) {
    return DM_ROWS.filter((row) => !row.attachment_path).slice(0, 3)
  }
  return DM_ROWS
}
export async function sendDirectMessage() {
  throw new Error('harness: sendDirectMessage is not stubbed')
}
export async function logWelfareAccess() {}
export async function blockDm() {}
export async function unblockDm() {}
export async function listMyBlocks() {
  return new Set()
}
export async function reportMessage() {}
export async function listOpenReports() {
  return []
}
export async function resolveReport() {}
export async function welfareOverview() {
  return []
}
export async function listWelfareAccessLog() {
  return []
}
export async function setStaffDmOptIn() {}

// ── The Chats list (24 Aug 2026) ───────────────────────────────────────────
// Invented people and squads only — CLAUDE.md rule 9. The shape mirrors
// public.my_chats(); the harness's chat-list scenario renders exactly this.
export async function listChats() {
  return [
    { kind: 'squad', team_id: 'hz-team-1', conversation_id: null, label: 'U13 Mixed', detail: 'Squad · announce-only', last_at: new Date(Date.now() - 12 * 60000).toISOString(), last_body: 'Kick-off moved to 10:30 Saturday. Pitch 2.', last_author_id: 'hz-coach', last_author_name: 'Harriet Zephyr', unread: 3 },
    { kind: 'dm', team_id: null, conversation_id: 'hz-conv-1', label: 'Sam Quillon', detail: 'Team Manager', last_at: new Date(Date.now() - 95 * 60000).toISOString(), last_body: 'Two seats held, thanks', last_author_id: 'hz-self', last_author_name: 'You', unread: 0 },
    { kind: 'staff', team_id: 'hz-team-1', conversation_id: null, label: 'U13 Mixed · staff', detail: 'Staff only', last_at: new Date(Date.now() - 26 * 3600000).toISOString(), last_body: 'Selection for Saturday — thoughts?', last_author_id: 'hz-coach', last_author_name: 'Harriet Zephyr', unread: 1 },
    { kind: 'club', team_id: null, conversation_id: null, label: 'Whole club', detail: 'Club-wide · admins post', last_at: new Date(Date.now() - 3 * 86400000).toISOString(), last_body: 'Registration closes Friday', last_author_id: 'hz-admin', last_author_name: 'Ora Vantage', unread: 0 },
    { kind: 'squad', team_id: 'hz-team-2', conversation_id: null, label: 'U16 Boys', detail: 'Squad · open chat', last_at: new Date(Date.now() - 5 * 86400000).toISOString(), last_body: 'Fixture thread · v Probe Exiles', last_author_id: 'hz-parent', last_author_name: 'Dov Lantern', unread: 0 },
  ]
}
export function chatPath(row) {
  switch (row.kind) {
    case 'group':
    case 'dm':
      return `/chat/dm/${row.conversation_id}`
    case 'club':
      return '/chat/club'
    case 'staff':
      return `/chat/${row.team_id}?channel=staff`
    default:
      return `/chat/${row.team_id}`
  }
}
export async function clearConversation() {}
export async function deleteConversation() {}
export async function clearChannel() {
  return 0
}

// ── Groups (24 Aug 2026) — claude/plans/2026-08-24-group-chats.md ──────────
// Invented people only — CLAUDE.md rule 9.
export async function createGroup() {
  return 'hz-group-1'
}
export async function renameGroup() {}
export async function addGroupMembers() {}
export async function leaveGroup() {}
export async function removeGroupMember() {}
export async function listGroupMembers() {
  return [
    { profile_id: 'hz-self', is_owner: true, full_name: 'You' },
    { profile_id: 'hz-parent', is_owner: false, full_name: 'Dov Lantern' },
    { profile_id: 'hz-manager', is_owner: false, full_name: 'Sam Quillon' },
  ]
}
export async function listGroupCandidates() {
  return [
    { profile_id: 'hz-parent', full_name: 'Dov Lantern', role: 'parent', via_team: 'U13 Mixed' },
    { profile_id: 'hz-manager', full_name: 'Sam Quillon', role: 'manager', via_team: 'U13 Mixed' },
    { profile_id: 'hz-coach', full_name: 'Harriet Zephyr', role: 'coach', via_team: 'U13 Mixed' },
  ]
}

// ── Emoji reactions (24 Aug 2026) — invented people only, CLAUDE.md rule 9 ──
export async function listReactions() {
  return new Map([['hz-msg-1', [
    { message_id: 'hz-msg-1', profile_id: 'hz-parent', emoji: '👍' },
    { message_id: 'hz-msg-1', profile_id: 'hz-manager', emoji: '👍' },
    { message_id: 'hz-msg-1', profile_id: 'hz-self', emoji: '👏' },
  ]]])
}
export async function toggleReaction() {}
export function subscribeReactions() {
  return () => {}
}

// ── Ticks and receipts (26 Aug 2026) ────────────────────────────────────────
// A delivered-but-unread receipt on one stub message, so a shoot of the DM
// thread shows the double grey tick rather than nothing.
export async function listMessageReceipts() {
  // Own messages in DM_ROWS are i %% 3 === 2 → hz-dm-3/6/9/12/15. The last
  // (15) delivered-not-read (double grey), 12 read (accent), the rest fall
  // to 'sent' — a shoot shows all three states at once.
  return new Map([
    ['hz-dm-15', { delivered: new Set(['hz-sam']), read: new Set() }],
    ['hz-dm-12', { delivered: new Set(['hz-sam']), read: new Set(['hz-sam']) }],
  ])
}
export async function markMessagesDelivered() {}
export function receiptState(receipt, recipients) {
  const others = (recipients ?? []).filter(Boolean)
  if (others.length === 0) return 'sent'
  if (receipt && others.every((id) => receipt.read.has(id))) return 'read'
  if (receipt && others.every((id) => receipt.delivered.has(id))) return 'delivered'
  return 'sent'
}
