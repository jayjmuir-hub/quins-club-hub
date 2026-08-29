import { ageBandFromTeamName } from './ageGroup.js'

// How much of a pitch a booking uses, and the age-based default.
//
// WHY THIS EXISTS. `events.pitch` names a whole pitch, but a pitch is routinely
// shared: at training different age groups take a quarter or a half of the same
// surface, and even matches split it for the younger bands — only U12 and older
// get a full pitch for a match (Jay, 29 Aug 2026). Without a portion, two
// squads on one pitch look like a double booking when they fit side by side.
// With one, clash detection becomes a capacity question — see findPitchClashes
// in src/data/pitches.js.
//
// Pure, no React and no imports beyond ageGroup — the same rule minis.js and
// ageGroup.js already follow, so a test and the clash detector can both read it
// without pulling a component tree in.
//
// ⚠️ THE THREE PORTION VALUES ARE THE STORED VOCABULARY. `events.pitch_portion`
// is text holding one of these, or NULL. NULL means "nobody split it" and is
// treated as a FULL pitch everywhere — the conservative default that keeps
// today's behaviour exactly: before any portion is entered, two overlapping
// bookings on one pitch still clash. See portionFraction.

/** The pickable portions, small → large, for a picker beside the pitch field. */
export const PITCH_PORTIONS = [
  { value: 'quarter', label: 'Quarter', fraction: 0.25 },
  { value: 'half', label: 'Half', fraction: 0.5 },
  { value: 'full', label: 'Full pitch', fraction: 1 },
]

const FRACTION = new Map(PITCH_PORTIONS.map((p) => [p.value, p.fraction]))

/**
 * The fraction of a pitch a portion uses.
 *
 * ⚠️ ANYTHING UNRECOGNISED IS A FULL PITCH, NULL INCLUDED. That is what makes
 * the feature backward-compatible: an event with no `pitch_portion` set counts
 * as a whole pitch, so capacity detection over a database with no portions yet
 * reproduces the old "same pitch + overlap = clash" behaviour precisely.
 */
export function portionFraction(portion) {
  return FRACTION.get(portion) ?? 1
}

/** The human label for a stored portion, or null when it is unset/whole. */
export function portionLabel(portion) {
  return PITCH_PORTIONS.find((p) => p.value === portion)?.label ?? null
}

// ── Age-based defaults ─────────────────────────────────────────────────────
//
// ⚠️ THESE ARE THEIR OWN NAMED BOUNDARIES, NOT BORROWED FROM minis.js. The
// minis boundaries (Mighty Minis ≤ U8, no league ≤ U10) fall in different
// places for different reasons, and minis.js warns at length against a reader
// "correcting" one to match another. Pitch size is a third question, so it gets
// its own constants even though QUARTER_PITCH_MAX_AGE happens to equal
// MIGHTY_MINIS_MAX_AGE today — they are equal by coincidence, not by rule.

/** U8 and below default to a quarter pitch. */
export const QUARTER_PITCH_MAX_AGE = 8

/** U12 and older get a full pitch for a MATCH (Jay, 29 Aug 2026). Below it, a half. */
export const MATCH_FULL_MIN_AGE = 12

/**
 * The portion to pre-fill for a squad, from its name. Always editable — this is
 * a suggestion the person booking can override, never a rule the save enforces,
 * exactly like the other age-derived UI in minis.js.
 *
 * Matches (Jay's rule):
 *   U6–U8   → quarter
 *   U9–U11  → half
 *   U12+    → full   (and so does a senior side, and an unreadable name)
 *
 * Training leans smaller, because squads share the ground far more at training
 * than on a match day:
 *   U6–U8   → quarter
 *   U9+     → half    (a youth squad that gets the whole pitch is the override)
 *   senior  → full
 *
 * @param {string} teamName squad name, e.g. "U8 Tag"
 * @param {{ type?: string }} [opts] the event type; 'training' leans smaller
 * @returns {'quarter'|'half'|'full'}
 */
export function defaultPitchPortion(teamName, { type } = {}) {
  const band = ageBandFromTeamName(teamName)
  // A senior side or an unreadable name is not youth: give it a full pitch,
  // the same fail-open direction ageGroup.js takes for a null band.
  if (band === null) return 'full'
  if (band <= QUARTER_PITCH_MAX_AGE) return 'quarter'
  if (type === 'training') return 'half'
  return band >= MATCH_FULL_MIN_AGE ? 'full' : 'half'
}
