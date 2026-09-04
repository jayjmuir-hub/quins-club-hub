// Harness stub replacing src/data/matchSheets.js via a Vite alias. Same public
// shape as the real module, returning fixtures instead of querying Supabase.
//
// ⚠️ EVERY EXPORT THE REAL MODULE HAS, even the ones no scenario calls. A
// missing export here is a module-resolution failure that blanks the WHOLE
// harness, not just this screen — the trap harness/stubs/members.js already
// carries a note about, and the same class of rot that killed every scenario
// in this file for days when an import went stale.
//
// ⚠️ getMatchSheet RETURNS null, which is the state that matters for layout: a
// coach opening a blank form on a phone at the side of a pitch. A stored sheet
// would fill the 22 rows and make the widest row narrower, not wider.

export const SLOT_COUNT = 22

export async function getMatchSheet() {
  return null
}

export async function listMatchSheetsFor() {
  return new Map()
}

export async function saveMatchSheet(sheet) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'match-sheet', payload: sheet })
  return { id: 'ms-harness', ...sheet }
}

export async function saveMatchSheetSlots(matchSheetId, slots) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'match-sheet-slots', payload: slots })
  return []
}

export async function saveMatchSheetCards(matchSheetId, cards) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'match-sheet-cards', payload: cards })
  return []
}

export async function saveMatchSheetScores(matchSheetId, rows) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'match-sheet-scores', payload: rows })
  return []
}

export async function setMatchSheetStatus(id, status) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'match-sheet-status', payload: { id, status } })
  return { id, status }
}
