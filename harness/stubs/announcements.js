// Stub for src/data/announcements.js — enough for screens that show the
// NoticeBoard. No notices; nothing pinned renders nothing, by design.
export async function listNotices() {
  return []
}
export async function listMyReads() {
  return []
}

// The rest of the real module's surface for co-bundled screens.
export async function markNoticesRead() {}
export async function createNotice() { return { id: 'stub-n1' } }
export async function updateNotice() { return { id: 'stub-n1' } }
export async function deleteNotice() {}
export async function noticeStats() { return new Map() }
export async function noticeAudience() { return [] }
export const NOTICE_REALTIME_DEBOUNCE_MS = 400
export function subscribeNotices() { return () => {} }
