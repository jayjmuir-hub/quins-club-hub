// design-system.md §7's POSITIONS enum — the list of positions a user may
// CHOOSE. Extracted from PlayerForm.jsx when the bulk importer arrived and
// needed to validate pasted positions against exactly the same set the form
// offers; two copies would drift the moment the club adds a position.
//
// This is deliberately NOT Roster.jsx's FORWARDS/BACKS arrays. Those are a
// grouping rule — which bucket a position falls into, including positions
// that are not on this list — and PlayerForm's original comment is right that
// merging them would couple two things that are only coincidentally similar.
// A position can be groupable without being offerable.
export const POSITIONS = [
  'Prop',
  'Hooker',
  'Lock',
  'Flanker',
  'Number 8',
  'Scrum-half',
  'Fly-half',
  'Centre',
  'Wing',
  'Fullback',
  'Utility',
]

// Case- and whitespace-insensitive lookup, returning the canonical spelling.
// Pasted data will carry "flanker", "FLY-HALF", "number 8" and similar; the
// database should still receive the enum's exact casing.
const BY_NORMALISED = new Map(POSITIONS.map((p) => [p.toLowerCase(), p]))

export function canonicalPosition(value) {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase()
  if (key === '') return null
  return BY_NORMALISED.get(key) ?? null
}
