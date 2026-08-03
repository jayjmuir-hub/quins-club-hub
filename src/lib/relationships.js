// The relationship a parent/carer has to the player.
//
// A FIXED LIST, NOT FREE TEXT (Jay's ruling, 3 Aug 2026, revising an earlier
// call for a free-text box). Free text across a few hundred players produces
// "Mum", "mum", "Mother", "MOTHER" and "M" as five different values, none of
// which can be filtered, counted or sorted. A closed list keeps the column
// worth querying.
//
// The order is deliberate: the two overwhelmingly common answers first, then
// step-parents, then wider family, then the catch-all. It is NOT alphabetical
// — alphabetical would put "Aunt" above "Mother", making the common case the
// hardest to reach.
//
// KNOWN GAP, flagged to Jay: this list has no escape hatch beyond "Guardian".
// A foster carer, an older sibling who does the school run, or a nanny who is
// the day-to-day contact all have to be recorded as "Guardian" or not at all.
// If that bites, adding a value here is a one-line change — the column is
// plain text with no CHECK constraint or enum behind it, precisely so this
// stays cheap.
export const RELATIONSHIPS = [
  'Mother',
  'Father',
  'Step-mother',
  'Step-father',
  'Aunt',
  'Uncle',
  'Grandmother',
  'Grandfather',
  'Guardian',
]

/**
 * Whether a stored relationship is one this app offers.
 *
 * Existing rows are not validated against this list on read: the column is
 * free text at the database level and legacy or imported data may hold
 * anything. Screens display whatever is stored; only the form is constrained.
 */
export function isKnownRelationship(value) {
  return RELATIONSHIPS.includes(value)
}
