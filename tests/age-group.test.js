// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, expect, it } from 'vitest'
import {
  ageBandFromTeamName,
  ageOnDate,
  allowsOwnContact,
  dobBandMismatch,
  isYouthTeam,
} from '../src/lib/ageGroup.js'

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

  // ⚠️ REGRESSION, 9 Aug 2026. The squad names gained B/G suffixes ("U12G QR",
  // "U14B Contact"). The old /^u(\d{1,2})\b/i needed a word boundary after the
  // digits; a letter is a word character, so there was none and every one of
  // these returned null. Under the old regex the first assertion below is the
  // one that fails, and it is the safeguarding one.
  it('reads a band through a B/G suffix with no space', () => {
    expect(ageBandFromTeamName('U12G QR')).toBe(12)
    expect(ageBandFromTeamName('U14B Contact')).toBe(14)
    expect(ageBandFromTeamName('U14G QR')).toBe(14)
    expect(ageBandFromTeamName('U16B Contact')).toBe(16)
    expect(ageBandFromTeamName('U16G Contact')).toBe(16)
    expect(ageBandFromTeamName('U18B Contact')).toBe(18)
    expect(ageBandFromTeamName('U18G Contact')).toBe(18)
  })

  it('will not read a third digit as part of the band', () => {
    // The lookahead allows a trailing letter but refuses another digit, so a
    // typo like "U123" is rejected outright rather than quietly becoming U12.
    expect(ageBandFromTeamName('U123')).toBeNull()
  })
})

// The live squad list, exactly as the club named it (Jay, 9 Aug 2026). This is
// the table that actually protects children: it asserts the real names rather
// than representative ones, so a rename in the database that this file does not
// know about shows up as a failing test rather than as a form field appearing
// on a child's record.
describe('the 15 club age groups + 3 senior sides', () => {
  const SQUADS = [
    ['U6 Tag', 6, false],
    ['U7 Tag', 7, false],
    ['U8 Tag', 8, false],
    ['U9 Mixed Contact', 9, false],
    ['U10 Mixed Contact', 10, false],
    ['U11 Mixed Contact', 11, false],
    ['U12 Mixed Contact', 12, false],
    ['U12G QR', 12, false], // <<< the one the old regex got wrong
    ['U13 Mixed Contact', 13, true],
    ['U14B Contact', 14, true],
    ['U14G QR', 14, true],
    ['U16B Contact', 16, true],
    ['U16G Contact', 16, true],
    ['U18B Contact', 18, true],
    ['U18G Contact', 18, true],
    ['Senior Men 1st XV', null, true],
    ['Senior Men 2nd XV', null, true],
    ["Women's XV", null, true],
  ]

  it.each(SQUADS)('%s → band %s, own contact %s', (name, band, own) => {
    expect(ageBandFromTeamName(name)).toBe(band)
    expect(allowsOwnContact(name)).toBe(own)
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


// ══ THE DATE OF BIRTH, ADDED 17 Aug 2026 ═══════════════════════════════════
//
// ⚠️ THE FACT THAT SHAPES EVERY TEST BELOW: rugby age bands are SEASON-RELATIVE
// and a birthday is not. "U13" means under 13 as at a cut-off date, so a U13
// squad is mostly TWELVE-year-olds for most of the season — and this app does
// not know the cut-off. So nothing here converts a birthday into a band and
// compares it for equality; it only asks whether the two are so far apart that
// a human should look.
//
// Every case passes `today` explicitly. A test that let it default to the real
// clock would start failing on somebody's birthday.

const TODAY = new Date('2026-08-17T00:00:00Z')

describe('ageOnDate', () => {
  it('counts whole years', () => {
    expect(ageOnDate('2014-03-04', TODAY)).toBe(12)
    expect(ageOnDate('2010-08-17', TODAY)).toBe(16)
  })

  // ⚠️ THE DAY BEFORE A BIRTHDAY IS STILL THE YOUNGER AGE. Getting this wrong by
  // one day is invisible for 364 days a year.
  it('does not count a birthday that has not happened yet', () => {
    expect(ageOnDate('2010-08-18', TODAY)).toBe(15)
    expect(ageOnDate('2010-08-17', TODAY)).toBe(16)
  })

  it('returns null rather than throwing on junk', () => {
    expect(ageOnDate('', TODAY)).toBeNull()
    expect(ageOnDate(null, TODAY)).toBeNull()
    expect(ageOnDate('not-a-date', TODAY)).toBeNull()
  })
})

describe('dobBandMismatch', () => {
  // ⚠️ THE CASE THE WIDE TOLERANCE EXISTS FOR, AND THE ONE A NAIVE CHECK GETS
  // WRONG. A twelve-year-old in U13 is the NORMAL state of a U13 squad, not a
  // mismatch — a check that fired here would fire on most of the club.
  it('says nothing about a twelve-year-old in U13', () => {
    expect(dobBandMismatch('U13', '2014-03-04', TODAY)).toBeNull()
  })

  it('says nothing about the same child in U12 or U14', () => {
    expect(dobBandMismatch('U12', '2014-03-04', TODAY)).toBeNull()
    expect(dobBandMismatch('U14', '2014-03-04', TODAY)).toBeNull()
  })

  // ⚠️ THE CASE FROM THE PLAN: "born 2010 and picked U12 -> it asks whether that
  // is right". Nobody argues with this one.
  it('asks about a sixteen-year-old in U12', () => {
    expect(dobBandMismatch('U12', '2010-03-04', TODAY)).toMatch(/16/)
  })

  it('asks about a six-year-old in U14', () => {
    expect(dobBandMismatch('U14', '2020-03-04', TODAY)).toMatch(/check the date/i)
  })

  it('asks about a small child on a senior side', () => {
    expect(dobBandMismatch('Senior Men 1st XV', '2018-03-04', TODAY)).toMatch(/check the date/i)
  })

  it('says nothing about an adult on a senior side', () => {
    expect(dobBandMismatch('Senior Men 1st XV', '1994-03-04', TODAY)).toBeNull()
  })

  // ⚠️ THE WINDOW IS WIDER UPWARDS THAN DOWNWARDS, AND THAT FELL OUT OF THE
  // MODEL RATHER THAN BEING DESIGNED — but it is the right way round, so it
  // stays. A twelve-year-old is plausibly U13 or U14 (which of the two depends
  // on the cut-off this app does not know), and one year of grace on each end
  // gives U12 through U15. So:
  //
  //   playing UP   — U14, U15 for a twelve-year-old — silent. Normal.
  //   playing DOWN — U12 silent, U11 QUESTIONED.
  //
  // The asymmetry is safeguarding-relevant in the direction that matters: an
  // OLDER child in a much younger squad is the case worth a second look, and a
  // younger child playing up is ordinary.
  //
  // ⚠️ MY FIRST VERSION OF THIS TEST ASSERTED U11 WAS SILENT AND THE CODE
  // DISAGREED. The code was right: a twelve-year-old in U11 was ten at any
  // plausible cut-off, which is not a dispensation, it is a wrong date.
  it('tolerates a year of grace on each end of the plausible window', () => {
    expect(dobBandMismatch('U15', '2014-03-04', TODAY)).toBeNull()
    expect(dobBandMismatch('U12', '2014-03-04', TODAY)).toBeNull()

    // Two bands out, in either direction, is worth asking about.
    expect(dobBandMismatch('U16', '2014-03-04', TODAY)).not.toBeNull()
    expect(dobBandMismatch('U11', '2014-03-04', TODAY)).not.toBeNull()
  })

  // ⚠️ SILENT UNTIL BOTH ANSWERS EXIST. Questioning a squad nobody has picked
  // yet, or a birthday nobody has typed, is the form arguing with a blank.
  it('says nothing while either half is missing', () => {
    expect(dobBandMismatch('U12', '', TODAY)).toBeNull()
    expect(dobBandMismatch('', '2010-03-04', TODAY)).toBeNull()
    expect(dobBandMismatch(undefined, undefined, TODAY)).toBeNull()
  })
})
