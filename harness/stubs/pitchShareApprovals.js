// Harness stub replacing src/data/pitchShareApprovals.js via a Vite alias.
//
// ⚠️ shareKey IS THE REAL IMPLEMENTATION, RE-EXPORTED, not a fake — the panel's
// approved-state lookup keys on it, so a divergent copy would make the harness
// check its own fixture (the same rule stubs/pitches.js states for
// findPitchClashes). Re-exported the LONG way (import then export function),
// because tests/harness-stubs.test.js refuses `export { … } from`.
//
// ⚠️ EVERY EXPORT THE REAL MODULE HAS. A missing one blanks the whole harness.
//
// The three async writers keep an in-memory Set instead of reaching Supabase,
// so the "It's fine — approve" / "Undo" control actually toggles on the real
// renderer — click it and the clash marker clears, exactly as in the app.
import { shareKey as realShareKey } from '../../src/data/pitchShareApprovals.js'

export function shareKey(events) {
  return realShareKey(events)
}

const approved = new Set()

export async function listShareApprovalKeys() {
  return new Set(approved)
}

export async function approveShare(events) {
  const key = realShareKey(events)
  approved.add(key)
  return { share_key: key }
}

export async function unapproveShare(key) {
  approved.delete(key)
}
