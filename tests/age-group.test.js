import { describe, expect, it } from 'vitest'
import { ageBandFromTeamName, allowsOwnContact, isYouthTeam } from '../src/lib/ageGroup.js'

// The rule under test comes straight from Jay (3 Aug 2026): a player at U13 or
// above may hold their own email and phone (optional); below U13 they may not,
// and the UI must not even offer the fields. Everything keys off the squad
// name because teams has no age column — see the header of ageGroup.js.

describe('ageBandFromTeamName', () => {
  it('reads the number out of a youth squad name', () => {
    expect(ageBandFromTeamName('U6')).toBe(6)
    expect(ageBandFromTeamName('U13')).toBe(13)
    expect(ageBandFromTeamName('U18 Colts')).toBe(18)
  })

  it('is case- and space-insensitive', () => {
    expect(ageBandFromTeamName('u14')).toBe(14)
    expect(ageBandFromTeamName('  U15  ')).toBe(15)
  })

  it('returns null for the senior sides, which have no age band', () => {
    expect(ageBandFromTeamName('Senior Men 1st XV')).toBeNull()
    expect(ageBandFromTeamName('Senior Men 2nd XV')).toBeNull()
    expect(ageBandFromTeamName("Women's XV")).toBeNull()
  })

  it('returns null rather than throwing on junk', () => {
    expect(ageBandFromTeamName(undefined)).toBeNull()
    expect(ageBandFromTeamName(null)).toBeNull()
    expect(ageBandFromTeamName('')).toBeNull()
    expect(ageBandFromTeamName(42)).toBeNull()
  })

  it('does not mistake an embedded number for an age band', () => {
    // "1st XV" must not read as age 1. Only a leading U<number> counts.
    expect(ageBandFromTeamName('Senior Men 1st XV')).toBeNull()
  })
})

describe('isYouthTeam', () => {
  it('is true for any U-numbered squad and false for the senior sides', () => {
    expect(isYouthTeam('U10')).toBe(true)
    expect(isYouthTeam('U18 Colts')).toBe(true)
    expect(isYouthTeam('Senior Men 1st XV')).toBe(false)
    expect(isYouthTeam("Women's XV")).toBe(false)
  })
})

describe('allowsOwnContact', () => {
  it('allows U13 and above', () => {
    expect(allowsOwnContact('U13')).toBe(true)
    expect(allowsOwnContact('U14')).toBe(true)
    expect(allowsOwnContact('U18 Colts')).toBe(true)
  })

  it('refuses below U13', () => {
    expect(allowsOwnContact('U6')).toBe(false)
    expect(allowsOwnContact('U12')).toBe(false)
  })

  it('allows the senior sides, who are adults', () => {
    expect(allowsOwnContact('Senior Men 1st XV')).toBe(true)
    expect(allowsOwnContact("Women's XV")).toBe(true)
  })

  it('fails CLOSED on an unknown or missing squad name', () => {
    // The safeguarding-relevant case. A name we cannot parse is treated as an
    // adult side by ageBandFromTeamName (null = no band), so this asserts the
    // one input where that would be wrong: nothing at all. With no team we
    // cannot know the age, and offering a child's own phone field by accident
    // is worse than withholding an adult's.
    expect(allowsOwnContact(undefined)).toBe(false)
    expect(allowsOwnContact(null)).toBe(false)
    expect(allowsOwnContact('')).toBe(false)
  })
})
