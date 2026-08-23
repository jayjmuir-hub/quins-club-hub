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
  return new Set()
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
export async function listMentionablesFor() {
  return []
}
export async function listDmCandidates() {
  return []
}
export async function openConversation() {
  throw new Error('harness: openConversation is not stubbed')
}
export async function listMyConversations() {
  return []
}
export async function getConversation() {
  return null
}
export async function listDirectMessages() {
  return []
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
