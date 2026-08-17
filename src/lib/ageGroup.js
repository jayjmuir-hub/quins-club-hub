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
// It landed. Do not do that re-point on the strength of that sentence — see the
// long note on `dobBandMismatch` below, and item 3 of
// claude/plans/2026-08-16-account-creation-redesign.md. The short version:
// RUGBY AGE BANDS ARE SEASON-RELATIVE AND A BIRTHDAY IS NOT, so a U13 squad is
// full of twelve-year-olds for most of the season, and a naive "is this child 13
// today?" check would strip the own-contact field from nearly a whole squad the
// club's own rule permits it for.
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

// ══ THE DATE OF BIRTH, AND WHAT IT MAY AND MAY NOT BE USED FOR ═══════════
//
// ⚠️ READ THIS BEFORE WIRING A BIRTHDAY INTO ANY AGE DECISION.
//
// Rugby age bands are SEASON-RELATIVE: "U13" means under 13 as at the season's
// cut-off date, so a U13 squad is mostly TWELVE-year-olds for most of the
// season. A birthday is not season-relative. The two therefore disagree by
// design, not occasionally — and the size of the disagreement is up to a full
// year in either direction depending on where in the season you ask.
//
// ⚠️ AND THIS APP DOES NOT KNOW THE CUT-OFF DATE. Nothing in the schema, the
// docs or this file records it (searched 17 Aug 2026). So NOTHING here converts
// a birthday into a band and compares it for equality. It only ever asks
// "is this so far out that a human should look?", with a deliberately wide
// tolerance, and the answer is a QUESTION rather than a refusal.
//
// ⚠️ WHICH IS ALSO WHY `allowsOwnContact` ABOVE STILL TAKES ONLY A SQUAD NAME.
// A gate keyed on "is this child 13 today" would refuse most of a U13 squad the
// club's own rule permits. If that re-point is ever made it needs the cut-off
// date, from Jay, and it must only ever make the gate STRICTER — a parent may
// write their own child's birthday, so the opposite direction would let a
// family unlock a field the club forbids.

/**
 * The age a senior side implies. Deliberately generous — colts and first-team
 * squads overlap, and this is only ever used to ask a question.
 */
export const SENIOR_MIN_AGE = 16

/**
 * ⚠️ ONE YEAR OF GRACE ON TOP OF AN ALREADY-WIDE WINDOW, AND THE WIDTH IS THE
 * WHOLE POINT. Playing up an age group is normal and playing down happens with a
 * dispensation; the failure this catches is the one nobody argues with — a child
 * born in 2010 registered into U12. A tight tolerance here would fire on half
 * the club and be switched off within a week.
 */
export const BAND_GRACE_YEARS = 1

/** Whole years between two dates. Returns null for anything unparseable. */
export function ageOnDate(dateOfBirth, today) {
  if (typeof dateOfBirth !== 'string' || dateOfBirth.trim() === '') return null
  const born = new Date(`${dateOfBirth.trim()}T00:00:00Z`)
  if (Number.isNaN(born.getTime())) return null
  const now = today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date()

  let age = now.getUTCFullYear() - born.getUTCFullYear()
  const monthDiff = now.getUTCMonth() - born.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1
  return age
}

/**
 * The two bands a child of this age could plausibly be in, given that the
 * cut-off is unknown.
 *
 * A child aged A is under A+1 today, so A+1 is the usual band; if their birthday
 * fell after the cut-off they were a year younger then, which puts them in A+2.
 * Both are legitimate, and which one applies depends on a date this app does not
 * hold.
 */
function plausibleBands(age) {
  return [age + 1, age + 2]
}

/**
 * How far outside the plausible window a chosen squad sits, in years — 0 when it
 * is fine. Exported for the tests; the sentence below is what screens use.
 */
export function bandDistance(teamName, dateOfBirth, today) {
  const age = ageOnDate(dateOfBirth, today)
  if (age === null || age < 0) return 0

  const band = ageBandFromTeamName(teamName)
  const [low, high] = plausibleBands(age)

  // A senior side has no band. Judge it on the age alone: an adult squad is
  // wrong for a small child and right for everybody else.
  if (band === null) {
    if (typeof teamName !== 'string' || teamName.trim() === '') return 0
    return age >= SENIOR_MIN_AGE ? 0 : SENIOR_MIN_AGE - age
  }

  if (band < low) return low - band
  if (band > high) return band - high
  return 0
}

/**
 * A sentence to show when a birthday and a squad disagree badly, or null.
 *
 * ⚠️ IT ASKS, IT DOES NOT REFUSE — the same asymmetry as the gender rule, which
 * refuses a BLANK and permits a CONTRADICTION. A wrong-looking date is usually a
 * typo and occasionally a genuine dispensation, and a form that blocks the
 * second to catch the first is a form that stops the club registering a real
 * child.
 */
export function dobBandMismatch(teamName, dateOfBirth, today) {
  const distance = bandDistance(teamName, dateOfBirth, today)
  if (distance <= BAND_GRACE_YEARS) return null

  const age = ageOnDate(dateOfBirth, today)
  return (
    `That birthday makes them ${age}, which looks a long way from ${String(teamName).trim()}. ` +
    'Check the date and the age group — you can still save if it is right.'
  )
}
