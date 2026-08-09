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
// ⚠️ REWRITTEN 9 Aug 2026. Until the club's real squad list landed, the ONLY
// named-gender squads were the three senior sides, and every youth group was
// genuinely mixed — so this failed open on all of them, deliberately. The new
// list is not like that:
//
//   single-gender: U12G QR, U14B Contact, U14G QR, U16B Contact,
//                  U16G Contact, U18B Contact, U18G Contact,
//                  Senior Men 1st XV, Senior Men 2nd XV, Women's XV
//   genuinely mixed: every "Tag" and every "Mixed Contact"
//
// The suffix is a single B or G welded to the digits with no separator, which
// is why it needs its own anchored pattern rather than a substring search.
// ---------------------------------------------------------------------

// ⚠️ THE SUFFIX MUST TOUCH THE DIGITS, and must be the whole token.
//
// `[bg]` immediately after the age number, then a negative lookahead for
// another letter. Both halves are load-bearing:
//   - touching the digits is what stops "U6 Tag" reading its "T-a-G" as a
//     girls' squad. The character after "6" is a space, not b or g, so there
//     is no match at all.
//   - the lookahead is what stops a future "U14Boys Development" matching on
//     "B" and then being classified twice by two different rules.
const SINGLE_GENDER_SUFFIX = /^u\d{1,2}([bg])(?![a-z])/i

// ⚠️ WORD BOUNDARIES, NOT `includes`. This used to be name.includes('men'),
// which is true of "Development", "Improvers" and any other word with those
// three letters in a row — so a squad called "U14 Development" would have been
// silently classified as a men's side. Nothing was named that yet, which is
// the only reason it never fired.
const NAMED_FEMALE = /\b(women|women's|girls)\b/i
const NAMED_MALE = /\b(men|men's|boys)\b/i

/**
 * The gender a squad's NAME implies, or null when it implies none.
 *
 * Still fails open — an unclassifiable squad expects nothing — but the set of
 * unclassifiable squads is now only the genuinely mixed ones, which is what
 * makes it safe to act on the result rather than merely mention it.
 */
export function squadExpects(teamName) {
  if (typeof teamName !== 'string') return null

  // Female first, so a hypothetical "Senior Men's & Women's Touch" reads as
  // female rather than being called a men's squad on the strength of the word
  // that happens to come first.
  if (NAMED_FEMALE.test(teamName)) return 'female'
  if (NAMED_MALE.test(teamName)) return 'male'

  const suffix = teamName.trim().match(SINGLE_GENDER_SUFFIX)
  if (suffix) return suffix[1].toLowerCase() === 'g' ? 'female' : 'male'

  return null
}

/**
 * Whether this squad is single-gender, and therefore whether a player being
 * put into it must have a gender recorded.
 *
 * ⚠️ THIS IS THE HALF THAT IS ENFORCED. Jay's ruling, 9 Aug 2026: a mismatch
 * warns loudly and never blocks, but a BLANK gender in a single-gender squad
 * is refused. Without that second half the rule is decoration — anyone who
 * doesn't like the warning defeats it by not answering the question, and the
 * majority of players have no gender recorded, so "not answering" is the path
 * of least resistance rather than an unusual act.
 *
 * Mixed squads are untouched: "U9 Mixed Contact" and every Tag group take a
 * blank gender exactly as before.
 */
export function squadRequiresGender(teamName) {
  return squadExpects(teamName) !== null
}

/** The message for a blank gender on a single-gender squad. Named once so the
 *  four screens that enforce it cannot drift into saying four different things. */
export function genderRequiredMessage(teamName) {
  return `${teamName} is a single-gender squad, so this player's gender has to be recorded.`
}

/**
 * A human sentence when a player's recorded gender contradicts the squad
 * they are in, or null when there is nothing to say.
 *
 * Returns null — not a warning — in all three of these cases, and each one
 * matters:
 *   - gender not recorded. Handled by squadRequiresGender instead, which
 *     REFUSES rather than warns. Warning here as well would put two messages
 *     on screen about the same missing answer.
 *   - squad not classifiable. Every Tag and Mixed Contact group.
 *   - they agree. Obviously.
 *
 * ⚠️ THE RESULT IS ADVISORY AND MUST NEVER BLOCK A SAVE. Re-confirmed by Jay
 * on 9 Aug 2026 when the single-gender squads arrived: warn loudly, never
 * block. The club has had four women recorded in "Senior Men 2nd XV" — a real
 * squad arrangement, not a data error — and a hard validation would have made
 * those four players uneditable by anyone, including the person trying to fix
 * them. It is a note, not a gate.
 *
 * ⚠️ Do not "tidy" this by merging it with squadRequiresGender. They answer
 * different questions and Jay ruled on them SEPARATELY: blank is refused,
 * contradictory is allowed through with a warning. Collapsing them into one
 * check loses that distinction and quietly turns the warning into a block.
 */
export function squadMismatch(gender, teamName) {
  if (!gender) return null
  const expected = squadExpects(teamName)
  if (!expected) return null
  if (expected === gender) return null

  return `${genderLabel(gender)} player in ${teamName}. That's allowed — just check it's right.`
}
