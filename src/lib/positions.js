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

// The spellings clubs actually type, mapped onto the enum (22 Aug 2026, with
// the content-classified importer). Everything here is a POSITION WORD and
// nothing else — no bare numbers ("8" in a paste is as likely an age as a
// Number 8), no words that could be a surname. The map matters doubly now:
// the importer classifies cells by content, so a spelling this map knows is
// a position, and one it doesn't becomes part of a name in the preview.
const SYNONYMS = new Map(Object.entries({
  'winger': 'Wing',
  'centre back': 'Centre',
  'center': 'Centre',
  'full back': 'Fullback',
  'full-back': 'Fullback',
  'no 8': 'Number 8',
  'no. 8': 'Number 8',
  'no8': 'Number 8',
  'number eight': 'Number 8',
  'eighthman': 'Number 8',
  'eightman': 'Number 8',
  'scrum half': 'Scrum-half',
  'scrumhalf': 'Scrum-half',
  'fly half': 'Fly-half',
  'flyhalf': 'Fly-half',
  'out-half': 'Fly-half',
  'outhalf': 'Fly-half',
  'second row': 'Lock',
  '2nd row': 'Lock',
  'loosehead': 'Prop',
  'loose head': 'Prop',
  'loosehead prop': 'Prop',
  'tighthead': 'Prop',
  'tight head': 'Prop',
  'tighthead prop': 'Prop',
  'openside': 'Flanker',
  'blindside': 'Flanker',
  'openside flanker': 'Flanker',
  'blindside flanker': 'Flanker',
  'back row': 'Flanker',
  'utility back': 'Utility',
}))

export function canonicalPosition(value) {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase()
  if (key === '') return null
  return BY_NORMALISED.get(key) ?? SYNONYMS.get(key) ?? null
}
