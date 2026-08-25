// Stubbed player grades for the visual harness. See harness/vite.config.js.
//
// ⚠️ EXISTS FOR THE SAME REASON AS stubs/staff.js: src/data/playerTiers.js
// imports src/lib/supabase.js at module scope, so the Lineup scenario would
// refuse to boot without the alias — not merely fail one read.
//
// Empty on purpose: grades are decoration on the lineup screen and their
// rendering is covered by tests/lineup-eligibility.test.jsx. The harness
// scenario exists to look at slots, drag and the pitch.
// ⚠️ THE WHOLE EXPORT SURFACE of src/data/playerTiers.js, not just what Lineup
// reads — the alias redirects EVERY importer (Roster included), and a missing
// name is a module-load error that kills the scenario, not a failed call. The
// first run of shoot-lineup.mjs proved it: `does not provide an export named
// 'TIERS'`, thrown by a screen this stub was never written for.
export const TIERS = ['A', 'B', 'C']

export async function listPlayerGrades() {
  return new Map()
}

export async function setPlayerGrade() {
  return null
}

export async function listPlayerPositions() {
  return new Map()
}

export async function savePlayerPositions() {
  return null
}

export async function listPlayerUnits() {
  return new Map()
}

export async function setPlayerUnit() {
  return null
}
