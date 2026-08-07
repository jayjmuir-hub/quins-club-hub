// players.gender — the two values a user may CHOOSE, plus the squad rules
// that read them (7 Aug 2026, Jay's brief).
//
// Pure: no imports, no network, no React. Same rule as src/lib/positions.js
// and src/lib/scope.js, and for the same reason — the squad-mismatch rule
// below is the branchiest thing here and has to be testable with plain
// strings.
//
// ⚠️ NULL IS NOT ONE OF THESE VALUES, AND IS NOT AN ERROR. Every player
// predating this feature has gender null, and the club has no source to
// backfill from (the insurance export doesn't carry it). So "not recorded"
// is the majority state and will be for a long time. Nothing in this file
// treats null as a problem; the screens render it as absent, not as blank.
export const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

const LABELS = new Map(GENDERS.map((g) => [g.value, g.label]))

/**
 * The display label for a stored value, or null when there is nothing to
 * show. Returns null — not 'Not set' — so each caller decides whether an
 * unrecorded gender is worth a row of its own. On the roster it is simply
 * omitted; a list where two thirds of the rows read "Not recorded" is worse
 * than one that says nothing.
 */
export function genderLabel(value) {
  return LABELS.get(value) ?? null
}

/**
 * Case- and whitespace-insensitive lookup returning the canonical stored
 * value, or null. Mirrors canonicalPosition() in src/lib/positions.js.
 *
 * The synonyms exist for the bulk importer: a club spreadsheet column will
 * say "M", "F", "Boy", "Girl" as often as it says "Male". Everything else —
 * including the empty string — is null, and it is the CALLER's job to decide
 * whether null means "blank cell, fine" or "unrecognised value, report it".
 * parsePlayerPaste makes that distinction; this function cannot.
 */
const BY_NORMALISED = new Map([
  ['male', 'male'], ['m', 'male'], ['boy', 'male'], ['man', 'male'],
  ['female', 'female'], ['f', 'female'], ['girl', 'female'], ['woman', 'female'],
])

export function canonicalGender(value) {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase()
  if (key === '') return null
  return BY_NORMALISED.get(key) ?? null
}

// ---------------------------------------------------------------------
// Squad expectations
//
// ⚠️ THIS IS A NAME-MATCHING RULE, NOT A FACT ABOUT THE CLUB. It reads the
// squad's NAME, because that is the only signal in the schema — teams has
// id, club_id, name, sort_order, is_senior and nothing else. So it is
// exactly as reliable as the club's naming, and it FAILS OPEN: a squad it
// cannot classify expects nothing and warns about nobody.
//
// Failing open is the deliberate choice. Every age group from U6 to U18
// Colts is genuinely mixed at this club, and they are the overwhelming
// majority of the roster. A rule that guessed "U15 means boys" would fire a
// false warning on every girl in the youth section — hundreds of them — and
// a warning that is usually wrong is one people learn to click past, which
// costs more than having no warning at all.
//
// Only the senior sides carry gender in their names today:
//   "Senior Men 1st XV", "Senior Men 2nd XV"  -> male
//   "Women's XV"                              -> female
// ---------------------------------------------------------------------
export function squadExpects(teamName) {
  if (typeof teamName !== 'string') return null
  const name = teamName.toLowerCase()

  // Checked before the men's test so a hypothetical "Senior Men's & Women's
  // Touch" would match female first rather than being called a men's squad.
  // Neither string is a substring of the other today; the ordering is here
  // so that stays true if someone renames a squad.
  if (name.includes('women') || name.includes("women's") || name.includes('girls')) return 'female'
  if (name.includes('men') || name.includes('boys')) return 'male'
  return null
}

/**
 * A human sentence when a player's recorded gender contradicts the squad
 * they are in, or null when there is nothing to say.
 *
 * Returns null — not a warning — in all three of these cases, and each one
 * matters:
 *   - gender not recorded. The majority of players. Warning here would put a
 *     banner on almost every form in the app.
 *   - squad not classifiable. Every youth age group. See squadExpects.
 *   - they agree. Obviously.
 *
 * ⚠️ THE RESULT IS ADVISORY AND MUST NEVER BLOCK A SAVE. The club has four
 * women recorded in "Senior Men 2nd XV" right now — that is a real squad
 * arrangement, not a data error, and a hard validation would make those four
 * players uneditable by anyone. It is a note, not a gate.
 */
export function squadMismatch(gender, teamName) {
  if (!gender) return null
  const expected = squadExpects(teamName)
  if (!expected) return null
  if (expected === gender) return null

  return `${genderLabel(gender)} player in ${teamName}. That's allowed — just check it's right.`
}
