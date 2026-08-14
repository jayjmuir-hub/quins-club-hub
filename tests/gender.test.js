// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, expect, it } from 'vitest'
import {
  GENDERS,
  canonicalGender,
  genderLabel,
  genderRequiredMessage,
  squadExpects,
  squadMismatch,
  squadRequiresGender,
} from '../src/lib/gender.js'

// src/lib/gender.js is pure, so it is tested with plain strings — no render,
// no mocks. The squad rule is the branchiest thing in the feature and this is
// where it gets pinned; the screens only display what it returns.

describe('genderLabel', () => {
  it('labels the two stored values', () => {
    expect(genderLabel('male')).toBe('Male')
    expect(genderLabel('female')).toBe('Female')
  })

  // ⚠️ The screens rely on this being FALSY, not the string 'Not set'. Roster
  // appends " · {label}" only when truthy and PlayerDetail renders the pill
  // only when truthy; returning a placeholder here would put "Not recorded"
  // on ~300 roster rows.
  it('returns null - not a placeholder - for an unrecorded value', () => {
    expect(genderLabel(null)).toBeNull()
    expect(genderLabel(undefined)).toBeNull()
    expect(genderLabel('')).toBeNull()
    expect(genderLabel('nonsense')).toBeNull()
  })
})

describe('canonicalGender', () => {
  it('accepts the spellings a club spreadsheet actually contains', () => {
    expect(canonicalGender('Male')).toBe('male')
    expect(canonicalGender('  MALE ')).toBe('male')
    expect(canonicalGender('M')).toBe('male')
    expect(canonicalGender('boy')).toBe('male')
    expect(canonicalGender('Female')).toBe('female')
    expect(canonicalGender('f')).toBe('female')
    expect(canonicalGender('Girl')).toBe('female')
  })

  it('returns null for a blank cell and for anything unrecognised', () => {
    expect(canonicalGender('')).toBeNull()
    expect(canonicalGender('   ')).toBeNull()
    expect(canonicalGender('Y')).toBeNull()
    expect(canonicalGender('1')).toBeNull()
    expect(canonicalGender(null)).toBeNull()
    expect(canonicalGender(42)).toBeNull()
  })

  // The database CHECK constraint only allows these two literals. If this
  // function ever returned a display label, every import would abort.
  it('only ever returns a value the database constraint accepts', () => {
    const allowed = new Set(['male', 'female'])
    for (const input of ['M', 'f', 'Boy', 'Girl', 'MALE', 'woman', 'man']) {
      const out = canonicalGender(input)
      expect(allowed.has(out)).toBe(true)
    }
  })
})

describe('squadExpects', () => {
  it('reads the senior sides from their names', () => {
    expect(squadExpects('Senior Men 1st XV')).toBe('male')
    expect(squadExpects('Senior Men 2nd XV')).toBe('male')
    expect(squadExpects("Women's XV")).toBe('female')
  })

  // ⚠️ THE MIXED SQUADS ARE THE ONES WORTH PROTECTING. They are most of the
  // club, and a rule that guessed "U16 means boys" would fire a false warning
  // on every girl in the youth section — and, since 9 Aug, would also REFUSE
  // to save them without a gender. If this goes red because someone
  // "improved" the matching, the improvement is the bug.
  it('expects nothing of a Tag or Mixed Contact squad', () => {
    for (const name of [
      'U6 Tag', 'U7 Tag', 'U8 Tag',
      'U9 Mixed Contact', 'U10 Mixed Contact', 'U11 Mixed Contact',
      'U12 Mixed Contact', 'U13 Mixed Contact',
    ]) {
      expect(squadExpects(name)).toBeNull()
      expect(squadRequiresGender(name)).toBe(false)
    }
  })

  // ⚠️ THE TRAP. "U6 Tag" ends in a G. It is a mixed tag squad, not a girls'
  // squad, and the only thing separating the two readings is that the suffix
  // must TOUCH the digits. Delete the anchor and every Tag group in the club
  // becomes girls-only.
  it('does not read the G in "Tag" as a girls\' suffix', () => {
    expect(squadExpects('U6 Tag')).toBeNull()
    expect(squadExpects('U7 Tag')).toBeNull()
    expect(squadExpects('U8 Tag')).toBeNull()
  })

  it('reads the B/G suffix on the single-gender youth squads', () => {
    expect(squadExpects('U12G QR')).toBe('female')
    expect(squadExpects('U14B Contact')).toBe('male')
    expect(squadExpects('U14G QR')).toBe('female')
    expect(squadExpects('U16B Contact')).toBe('male')
    expect(squadExpects('U16G Contact')).toBe('female')
    expect(squadExpects('U18B Contact')).toBe('male')
    expect(squadExpects('U18G Contact')).toBe('female')
  })

  // The old implementation was name.includes('men'), which is true of
  // "Development", "Improvers", "Regimental" and anything else with those
  // three letters adjacent. Nothing was named that yet, which is the only
  // reason it never fired. Word boundaries now.
  it('does not read a word merely CONTAINING "men" as a men\'s squad', () => {
    expect(squadExpects('U14 Development')).toBeNull()
    expect(squadExpects('Development Squad')).toBeNull()
  })

  it('fails open on an unknown or missing squad name', () => {
    expect(squadExpects('Touch')).toBeNull()
    expect(squadExpects('')).toBeNull()
    expect(squadExpects(null)).toBeNull()
    expect(squadExpects(undefined)).toBeNull()
  })

  // "Women" contains no substring of "Men" as written, but a careless
  // implementation using name.includes('men') matches "women" too — that is
  // the exact bug this asserts against, and it is why the female test runs
  // first in the function.
  it('does not read "Women\'s XV" as a men\'s squad', () => {
    expect(squadExpects("Women's XV")).not.toBe('male')
  })
})

describe('squadMismatch', () => {
  it('warns when a recorded gender contradicts a gendered squad', () => {
    const message = squadMismatch('female', 'Senior Men 2nd XV')
    expect(message).toMatch(/Female player in Senior Men 2nd XV/)
    // Phrased as a check, not a correction — the club really does have four
    // women in that squad today.
    expect(message).toMatch(/allowed/)
  })

  it('says nothing when they agree', () => {
    expect(squadMismatch('male', 'Senior Men 1st XV')).toBeNull()
    expect(squadMismatch('female', "Women's XV")).toBeNull()
  })

  // Each of these is a separate reason for silence, and each one alone would
  // otherwise put a banner on hundreds of player records.
  it('says nothing when gender is not recorded', () => {
    expect(squadMismatch(null, 'Senior Men 1st XV')).toBeNull()
    expect(squadMismatch(undefined, "Women's XV")).toBeNull()
    expect(squadMismatch('', 'Senior Men 1st XV')).toBeNull()
  })

  it('says nothing about a mixed squad, whatever the gender', () => {
    expect(squadMismatch('female', 'U13 Mixed Contact')).toBeNull()
    expect(squadMismatch('male', 'U13 Mixed Contact')).toBeNull()
    expect(squadMismatch('female', 'U6 Tag')).toBeNull()
  })

  // ⚠️ JAY'S RULING, 9 Aug 2026: a mismatch WARNS and never blocks. These
  // assert the message exists — the screens assert that the save still goes
  // through, because that is a property of the form, not of this function.
  it('warns on a B/G youth squad the same way it does on the seniors', () => {
    expect(squadMismatch('male', 'U16G Contact')).toMatch(/Male player in U16G Contact/)
    expect(squadMismatch('female', 'U14B Contact')).toMatch(/Female player in U14B Contact/)
    expect(squadMismatch('female', 'U12G QR')).toBeNull()
    expect(squadMismatch('male', 'U18B Contact')).toBeNull()
  })
})

describe('squadRequiresGender', () => {
  // The enforced half. Blank gender is REFUSED on these; see
  // genderRequiredMessage and the four screens that call it.
  it('is true for every single-gender squad, youth and senior', () => {
    for (const name of [
      'U12G QR', 'U14B Contact', 'U14G QR', 'U16B Contact',
      'U16G Contact', 'U18B Contact', 'U18G Contact',
      'Senior Men 1st XV', 'Senior Men 2nd XV', "Women's XV",
    ]) {
      expect(squadRequiresGender(name)).toBe(true)
    }
  })

  it('is false for the mixed squads and for junk', () => {
    expect(squadRequiresGender('U6 Tag')).toBe(false)
    expect(squadRequiresGender('U13 Mixed Contact')).toBe(false)
    // ⚠️ Fails OPEN on an unknown name, unlike allowsOwnContact in
    // ageGroup.js which fails CLOSED. Different stakes: refusing to save a
    // player because a team row failed to load would be a dead form, whereas
    // offering a child's own phone field by accident is a safeguarding
    // failure. The asymmetry is deliberate and is why it is stated here.
    expect(squadRequiresGender(undefined)).toBe(false)
    expect(squadRequiresGender('')).toBe(false)
    expect(squadRequiresGender('Touch')).toBe(false)
  })
})

describe('genderRequiredMessage', () => {
  it('names the squad, so the person knows which field is the problem', () => {
    expect(genderRequiredMessage('U16G Contact')).toMatch(/U16G Contact/)
    expect(genderRequiredMessage('U16G Contact')).toMatch(/gender/i)
  })
})

describe('GENDERS', () => {
  // The form maps this straight onto radio options and the importer's
  // canonicaliser must agree with it. A third entry added here without a
  // matching migration would be written and then refused by the constraint.
  it('is exactly the two values the database constraint allows', () => {
    expect(GENDERS.map((g) => g.value)).toEqual(['male', 'female'])
    expect(GENDERS.map((g) => g.label)).toEqual(['Male', 'Female'])
  })
})
