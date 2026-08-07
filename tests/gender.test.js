import { describe, expect, it } from 'vitest'
import {
  GENDERS,
  canonicalGender,
  genderLabel,
  squadExpects,
  squadMismatch,
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

  // ⚠️ THE WHOLE POINT. Every youth age group at this club is mixed, and they
  // are the overwhelming majority of the roster. A rule that guessed "U15
  // means boys" would fire a false warning on every girl in the youth
  // section. If this test ever goes red because someone "improved" the
  // matching, the improvement is the bug.
  it('expects nothing of any youth age group', () => {
    for (const name of ['U6', 'U7', 'U10', 'U13', 'U15', 'U16', 'U18 Colts']) {
      expect(squadExpects(name)).toBeNull()
    }
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

  it('says nothing about a youth squad, whatever the gender', () => {
    expect(squadMismatch('female', 'U15')).toBeNull()
    expect(squadMismatch('male', 'U15')).toBeNull()
    expect(squadMismatch('female', 'U18 Colts')).toBeNull()
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
