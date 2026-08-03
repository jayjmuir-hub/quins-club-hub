// Age-band helpers. Pure, no imports — same rule as src/lib/playerFormat.js
// and src/lib/scope.js: plain strings in, plain values out, trivially testable.
//
// WHY THE SQUAD NAME AND NOT A DATE OF BIRTH: the club does not hold DOBs in
// this app, and `teams` has no age column — just `name` and `sort_order` (see
// db/schema/tables.sql). The 15 squad names are the only age signal there is,
// and they are club-controlled, stable, and already the thing every screen
// groups by. If a DOB column ever lands, `allowsOwnContact` is the one place
// to re-point; nothing else in the app reasons about age.
//
// THE RULE (Jay, 3 Aug 2026): a player in U13 or above may optionally hold
// their own email and phone. Below U13 they may not, and the forms must not
// render the fields at all rather than rendering them disabled — an empty box
// invites someone to find a way to fill it.

// Leading "U" then digits, e.g. "U6", "U18 Colts". Anchored at the start so
// "Senior Men 1st XV" cannot match on its "1".
const YOUTH_NAME = /^u(\d{1,2})\b/i

/**
 * The age band of a squad as a number, or null when the squad has none.
 *
 * "U14" → 14. "U18 Colts" → 18. "Senior Men 1st XV" → null, and so does
 * anything unparseable, including a non-string. Null means "no youth band",
 * which for the three senior sides correctly means adults — callers that care
 * about the difference between "adult" and "we don't know" must check the
 * input themselves, which is exactly what allowsOwnContact does below.
 */
export function ageBandFromTeamName(name) {
  if (typeof name !== 'string') return null
  const match = name.trim().match(YOUTH_NAME)
  if (!match) return null
  return Number(match[1])
}

/** True for a U-numbered squad, false for the senior sides and for junk. */
export function isYouthTeam(name) {
  return ageBandFromTeamName(name) !== null
}

/** The threshold, named once so the tests and the UI copy can't drift apart. */
export const OWN_CONTACT_MIN_AGE = 13

/**
 * Whether a player in this squad may hold their own contact details.
 *
 * Fails CLOSED on a missing or empty squad name. That asymmetry is deliberate:
 * ageBandFromTeamName returns null both for "Senior Men 1st XV" (adults, may
 * hold contact) and for undefined (we have no idea). Treating the second as
 * the first would offer a child's own phone field whenever a team row failed
 * to load. So a name we have is trusted, and a name we don't have is refused.
 */
export function allowsOwnContact(teamName) {
  if (typeof teamName !== 'string' || teamName.trim() === '') return false
  const band = ageBandFromTeamName(teamName)
  if (band === null) return true // a senior side: adults
  return band >= OWN_CONTACT_MIN_AGE
}
