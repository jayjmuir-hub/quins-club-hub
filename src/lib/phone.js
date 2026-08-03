import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js'

// Phone-number handling for the parent and player contact fields.
//
// STORAGE FORMAT — the decision everything else follows from: numbers are
// stored in E.164 ("+971501234567"). One canonical string, no separate
// country column, no spaces or brackets. That means a number typed by a coach
// in Abu Dhabi and one pasted by a parent visiting from Dublin end up
// identical in the database, `tel:` links work without cleaning, and a future
// SMS feature has something it can actually dial. The country picker is a
// data-entry aid that produces this string — it is not itself stored.
//
// WHY libphonenumber-js AND NOT A HAND-ROLLED LIST: dial codes are not a
// tidy one-country-one-number mapping. +1 covers the US, Canada and twenty
// Caribbean states; Kazakhstan shares +7 with Russia. A hand-rolled list gets
// the club's common cases right and then silently mangles the others. This
// library is the same metadata Google maintains for Android, and it also
// gives real validation (correct length and prefix for that country), which
// a regex cannot.
//
// The club is an expat club, so "the common cases" is a genuinely long list —
// UAE, UK, Ireland, South Africa, New Zealand, Australia, France, India,
// Pakistan, the Philippines, the US. That is why the picker offers every
// country rather than a curated shortlist.

/**
 * The club is in Abu Dhabi, so a new number is a UAE number until told
 * otherwise. This is the only place that assumption is encoded.
 */
export const DEFAULT_COUNTRY = 'AE'

// Country display names come from the browser's own Intl data rather than a
// bundled list: always present, always current, and correctly localised.
// A fallback to the raw ISO code covers the (unlikely) case of a runtime
// without region display names — a picker showing "AE" is degraded, one that
// throws is broken.
function countryName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * Every selectable country: ISO 3166-1 alpha-2 code, display name, and dial
 * code without the leading "+". Sorted by name, which is how a person scans
 * a picker — nobody looks for the UAE under "+971".
 *
 * Built once at module load. getCountries() returns ~245 entries and the
 * Intl lookup per entry is not free, so doing this inside a component would
 * repeat it on every render of every phone field on the screen.
 */
export const COUNTRIES = getCountries()
  .map((code) => ({ code, name: countryName(code), dial: getCountryCallingCode(code) }))
  .sort((a, b) => a.name.localeCompare(b.name))

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code))

/** The dial code for a country, or null. Used to render "+971" beside a flag. */
export function dialCodeFor(country) {
  if (!COUNTRY_CODES.has(country)) return null
  return getCountryCallingCode(country)
}

/**
 * Splits a stored number into the two things the input needs: which country
 * is selected, and what goes in the text box.
 *
 * The awkward input is the one that matters. player_contacts.phone is a text
 * column that has been accepting free-form numbers since the app shipped, so
 * it holds things like "050 111 2222" with no country information at all.
 * Those must keep working:
 *
 *   - A valid E.164 number splits properly:
 *       "+971501234567"  → { country: 'AE', national: '501234567' }
 *   - Anything unparseable keeps its digits and falls back to the default
 *     country, so an existing UAE number opens in the form as a UAE number
 *     with the digits intact rather than as an empty box. Nothing is
 *     silently discarded, and nothing is silently re-attributed to a country
 *     it might not belong to — the user sees the flag and can change it.
 *   - Empty or missing gives an empty box on the default country.
 */
export function splitPhone(stored) {
  const raw = typeof stored === 'string' ? stored.trim() : ''
  if (raw === '') return { country: DEFAULT_COUNTRY, national: '' }

  const parsed = parsePhoneNumberFromString(raw)
  if (parsed?.country && COUNTRY_CODES.has(parsed.country)) {
    return { country: parsed.country, national: parsed.nationalNumber }
  }

  // Unparseable, or parseable to a calling code that maps to several
  // countries with no way to tell which. Keep what the user has.
  return { country: DEFAULT_COUNTRY, national: raw }
}

/**
 * Turns a picked country plus typed digits into the E.164 string to store,
 * or null when there is nothing to store.
 *
 * Returns the BEST AVAILABLE string rather than refusing on invalid input:
 * an unrecognised-but-typed number is saved as "+<dial><digits>". Refusing
 * would mean a coach with a legitimately odd number — a satellite phone, a
 * newly-issued prefix the bundled metadata predates — simply cannot record
 * it. Validity is surfaced as a warning next to the field (see isValidPhone)
 * rather than as a wall.
 */
export function joinPhone(country, national) {
  const digits = String(national ?? '').replace(/[^\d]/g, '')
  if (digits === '') return null

  const code = COUNTRY_CODES.has(country) ? country : DEFAULT_COUNTRY
  const parsed = parsePhoneNumberFromString(digits, code)
  if (parsed?.isValid()) return parsed.number

  return `+${getCountryCallingCode(code)}${digits}`
}

/** Whether these digits are a real number in that country. Drives a warning, never a block. */
export function isValidPhone(country, national) {
  const digits = String(national ?? '').replace(/[^\d]/g, '')
  if (digits === '') return true // nothing typed is not an error; the field is optional
  const code = COUNTRY_CODES.has(country) ? country : DEFAULT_COUNTRY
  return Boolean(parsePhoneNumberFromString(digits, code)?.isValid())
}

/**
 * A stored number formatted for reading, e.g. "+971 50 123 4567".
 *
 * Falls back to the stored string untouched when it cannot be parsed, so a
 * legacy free-form number still displays as whatever the coach typed rather
 * than vanishing.
 */
export function formatPhone(stored) {
  const raw = typeof stored === 'string' ? stored.trim() : ''
  if (raw === '') return ''
  return parsePhoneNumberFromString(raw)?.formatInternational() ?? raw
}

/**
 * Digits grouped the way the selected country writes them, e.g.
 * ('AE', '501234567') → "050 123 4567". Returns the digits unchanged when the
 * number isn't recognised, so a part-typed or unusual number is never mangled.
 *
 * DELIBERATELY NOT AS-YOU-TYPE. libphonenumber ships an AsYouType formatter
 * and the obvious thing is to rewrite the field on every keystroke. Two
 * reasons not to: it silently declined to group several of the club's common
 * formats when handed a whole number at once (UAE among them), and — the real
 * objection — rewriting an input's value under the user moves the caret to the
 * end, so anyone correcting a digit in the middle of a number gets their
 * cursor thrown to the end after every keypress. That is a classic phone-field
 * bug and it is worse than plain digits. So the field takes what is typed, and
 * this function is used for DISPLAY only.
 */
export function formatNationalPhone(country, national) {
  const digits = String(national ?? '').replace(/[^\d]/g, '')
  if (digits === '') return ''
  const code = COUNTRY_CODES.has(country) ? country : DEFAULT_COUNTRY
  return parsePhoneNumberFromString(digits, code)?.formatNational() ?? digits
}
