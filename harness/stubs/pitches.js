// Harness stub replacing src/data/pitches.js via a Vite alias.
//
// ⚠️ findPitchClashes IS THE REAL IMPLEMENTATION, RE-EXPORTED, not a fake. It
// is pure — events in, pairs out, no Supabase — and the clash colouring is most
// of what the allocation screen is FOR. A stub that returned a hand-picked
// clash list would make the one thing worth looking at a thing this file
// decided, so the harness would be checking its own fixture.
//
// ⚠️ EVERY EXPORT THE REAL MODULE HAS, even the ones no scenario calls. A
// missing export is a module-resolution failure that blanks the WHOLE harness.
//
// ⚠️ RE-EXPORTED THE LONG WAY (`import` then `export const`), NOT
// `export { … } from`. tests/harness-stubs.test.js REFUSES the short form on
// purpose: its mirror check parses `export function|const|…` declarations, so a
// re-export would slip past it and the guard would quietly stop guarding this
// file. The rule caught this exact shortcut the first time it was tried.
//
// ⚠️ The import specifier is '../../src/data/pitches.js', which does NOT match
// the alias (anchored on '../data/pitches.js'), so this cannot recurse into
// itself — the same trick the auth.jsx alias documents.
import { findPitchClashes as realFindPitchClashes, PITCH_TBD as REAL_PITCH_TBD } from '../../src/data/pitches.js'

export const PITCH_TBD = REAL_PITCH_TBD

export function findPitchClashes(events) {
  return realFindPitchClashes(events)
}

// The club's real fifteen, in the real blocks (A1-A4, B1, C1-C5, D1-D5), plus
// one retired pitch — because "a booking on a retired pitch must still appear"
// is a rule of rowsFor() and needs something to exercise it.
export const HARNESS_PITCHES = [
  ...['A1', 'A2', 'A3', 'A4'].map((name, i) => ({ id: `p-a${i}`, name, is_active: true })),
  { id: 'p-b1', name: 'B1', is_active: true },
  ...['C1', 'C2', 'C3', 'C4', 'C5'].map((name, i) => ({ id: `p-c${i}`, name, is_active: true })),
  ...['D1', 'D2', 'D3', 'D4', 'D5'].map((name, i) => ({ id: `p-d${i}`, name, is_active: true })),
  { id: 'p-old', name: 'Old Show Pitch', is_active: false },
]

export async function listPitches({ includeRetired = false } = {}) {
  return includeRetired ? HARNESS_PITCHES : HARNESS_PITCHES.filter((pitch) => pitch.is_active)
}

// The redacted occupancy read (real one is the pitch_occupancy RPC). Two
// squads on D2 within the window — one genuine clash pair for the calendar to
// mark — plus an untroubled booking and a fanned-out multi-squad session
// sharing a group_id, which must NOT read as a clash.
export async function listPitchOccupancy({ from } = {}) {
  const base = new Date(from ?? Date.now())
  const at = (dayOffset, hour, minutes = 90) => {
    const start = new Date(base.getTime() + dayOffset * 86400000)
    start.setUTCHours(hour, 0, 0, 0)
    return {
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + minutes * 60000).toISOString(),
    }
  }
  return [
    { id: 'po-1', team_id: 't1', team_name: 'U12 Mixed', type: 'match', pitch: 'D2', group_id: null, ...at(1, 8) },
    { id: 'po-2', team_id: 't2', team_name: 'U14 Boys', type: 'match', pitch: 'D2', group_id: null, ...at(1, 8) },
    { id: 'po-3', team_id: 't1', team_name: 'U12 Mixed', type: 'training', pitch: 'C1', group_id: null, ...at(3, 16) },
    { id: 'po-4', team_id: 't1', team_name: 'U12 Mixed', type: 'training', pitch: 'A1', group_id: 'g-1', ...at(4, 16) },
    { id: 'po-5', team_id: 't2', team_name: 'U14 Boys', type: 'training', pitch: 'A1', group_id: 'g-1', ...at(4, 16) },
  ]
}

export async function upsertPitch(pitch) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'upsert-pitch', payload: pitch })
  return { id: pitch?.id ?? 'p-new', ...pitch }
}

export async function setPitchActive(id, isActive) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'set-pitch-active', payload: { id, isActive } })
  return { id, is_active: isActive }
}
