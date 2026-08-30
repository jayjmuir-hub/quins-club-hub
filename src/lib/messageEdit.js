// The edit-window hint, a PURE function — deliberately in lib/, not the data
// layer. It touches no network and no Supabase, and the chat tests mock
// src/data/messages.js WHOLESALE: the first draft exported this from there,
// and every such mock instantly lacked it, taking 38 DM tests down at once
// (30 Aug 2026). A pure rule the UI consults belongs beside the other pure
// rules, where a data-layer mock cannot swallow it.
//
// ⚠️ THE CLIENT HINT, NOT THE RULE. private.touch_message enforces author-only,
// 15 minutes; this only decides whether to DRAW the Edit control. A
// clock-skewed device that offers it a moment too long just sees the
// database's own sentence ("a message can be edited for 15 minutes").
export function canStillEdit(message, now = new Date()) {
  if (!message || message.deleted_at) return false
  const created = new Date(message.created_at)
  if (Number.isNaN(created.getTime())) return false
  return now.getTime() - created.getTime() < 15 * 60 * 1000
}
