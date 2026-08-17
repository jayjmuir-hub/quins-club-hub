// Age-band helpers. Pure, no imports — same rule as src/lib/playerFormat.js
// and src/lib/scope.js: plain strings in, plain values out, trivially testable.
//
// WHY THE SQUAD NAME AND NOT A DATE OF BIRTH: `teams` has no age column — just
// `name` and `sort_order` (see db/schema/tables.sql). The squad names are the
// only age signal on a team row, they are club-controlled, stable, and already
// the thing every screen groups by.
//
// ⚠️ THE CLUB *DOES* HOLD DATES OF BIRTH SINCE 16 Aug 2026 (public.player_private),
// AND `allowsOwnContact` IS STILL NOT RE-POINTED AT THEM. This note used to say
// "if a DOB column ever lands, allowsOwnContact is the one place to re-point".
// It landed, and that sentence points at a trap: RUGBY AGE BANDS ARE
// SEASON-RELATIVE AND A BIRTHDAY IS NOT. A U13 squad is mostly TWELVE-year-olds
// for most of the season, so "is this child 13 today?" would strip the
// own-contact field from nearly a whole squad the club's own rule permits it for.
//
// ⚠️ ANYTHING REASONING ABOUT A CHILD'S AGE BELONGS IN src/lib/ageGrade.js, which
// asks it AT THE 31 AUGUST CUT-OFF. If this gate is ever re-pointed it goes
// through there, and it may only ever make the rule STRICTER — a parent may
// write their own child's birthday, so the other direction would let a family
// unlock a field the club forbids.
//
// THE RULE (Jay, 3 Aug 2026): a player in U13 or above may optionally hold
// their own email and phone. Below U13 they may not, and the forms must not
// render the fields at all rather than rendering them disabled — an empty box
// invites someone to find a way to fill it.

// Leading "U" then digits, e.g. "U6", "U18 Colts", "U12G QR", "U14B Contact".
// Anchored at the start so "Senior Men 1st XV" cannot match on its "1".
//
// ⚠️ THE TRAILING TOKEN IS A NEGATIVE LOOKAHEAD, NOT `\b` (fixed 9 Aug 2026).
// It used to be /^u(\d{1,2})\b/i. `\b` needs a word boundary after the digits,
// and in "U12G" a LETTER follows the digits — both word characters, so there is
// no boundary, no match, and ageBandFromTeamName returned null. allowsOwnContact
// reads null as "a senior side: adults" and returned TRUE, which would have
// offered a twelve-year-old girls' squad the child's own email and phone fields
// — precisely what the rule below forbids.
//
// U14B/U14G/U16B/U16G/U18B/U18G failed to parse too. They are all 13 or over, so
// the answer came out right by accident, which is worse: the fault was invisible
// in every case except the one that mattered.
//
// (?![0-9]) permits a trailing LETTER while still refusing a third DIGIT, so
// "U123" is not silently read as U12.
const YOUTH_NAME = /^u(\d{1,2})(?![0-9])/i

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

