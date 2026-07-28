import { describe, it, expect } from 'vitest'
import { initials } from '../src/lib/playerFormat.js'

// Unit tests for src/lib/playerFormat.js. Pure functions, no imports beyond
// the module under test — same shape as tests/event-format.test.js and
// tests/scope.test.js.
//
// initials() exists because the club does not use jersey numbers (confirmed
// with Jay), so the roster row's leading tile and the player sheet's hero
// tile show initials derived from full_name instead. full_name is NOT NULL in
// the schema and is the only name field, so initials must cope with whatever
// a human typed into it.

describe('initials', () => {
  it('takes the first letter of the first and last names', () => {
    expect(initials('Tom Fletcher')).toBe('TF')
  })

  it('uppercases whatever it finds', () => {
    expect(initials('mateo fernández')).toBe('MF')
  })

  // Middle names are skipped rather than included: "FAM" would overflow a
  // 40px tile, and first+last is the convention every club app uses.
  it('skips middle names, using first and last only', () => {
    expect(initials('Faisal Al Mansoori')).toBe('FM')
    expect(initials('Samuel Adeyemi Johnson Okoro')).toBe('SO')
  })

  // A hyphenated or apostrophed surname is ONE name, so it contributes one
  // letter — its first. O'Sullivan is an O, not an OS; Nguyen-Fitzgerald is
  // an N, not an NF. Treating the punctuation as a separator would give
  // three-letter initials for a single surname.
  it('treats a hyphenated surname as one name', () => {
    expect(initials('Charlie Nguyen-Fitzgerald')).toBe('CN')
    expect(initials('Sami Al-Rashid')).toBe('SA')
  })

  it('treats an apostrophed surname as one name', () => {
    expect(initials("Eoin O'Sullivan")).toBe('EO')
    expect(initials('Ciara O’Brien')).toBe('CO')
  })

  // A single-word name has no second initial to take, so it uses the first
  // two letters of the one word — that keeps every tile two characters wide
  // rather than leaving lone-name players with a visibly smaller mark.
  it('uses the first two letters of a single-word name', () => {
    expect(initials('Ronaldinho')).toBe('RO')
  })

  it('copes with a single-character name', () => {
    expect(initials('X')).toBe('X')
  })

  it('ignores surrounding and repeated whitespace', () => {
    expect(initials('   Tom    Fletcher  ')).toBe('TF')
  })

  it('handles Latin letters beyond ASCII, including Turkish dotless ı', () => {
    expect(initials('Emre Yıldırım')).toBe('EY')
  })

  // full_name is NOT NULL in the schema, so these should be unreachable —
  // but a tile that renders "undefined" is worse than one that renders a
  // neutral placeholder, and this is display code.
  it('falls back to a placeholder for a missing or empty name', () => {
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
    expect(initials(null)).toBe('?')
    expect(initials(undefined)).toBe('?')
  })
})
