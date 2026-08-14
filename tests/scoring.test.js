// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'
import {
  SCORE_POINTS,
  SCORE_KINDS,
  scoringForBand,
  scoringForTeam,
  cleanScoringKinds,
  totalFor,
  hasNoComponents,
} from '../src/lib/scoring.js'

// The scoring model. claude/plans/2026-08-12-scoring-model.md
//
// ⚠️ THIS FILE PINS THE CLUB'S OWN SCORING RULES. They are age-grade rugby's,
// not another system's, and this app answers to nothing outside it. These tests
// are what makes a casual edit to the table fail loudly rather than quietly
// changing what a coach is allowed to record.

describe('the points table', () => {
  // ⚠️ RUGBY UNION'S VALUES. Confirm against the UAERF age-grade laws before a
  // season; they are the authority, not this file.
  it('⚠️ matches the upstream values exactly', () => {
    expect(SCORE_POINTS).toEqual({ tries: 5, conversions: 2, penalties: 3, drops: 3 })
  })

  it('⚠️ is frozen — the VALUES are the laws of the game, not a club setting', () => {
    expect(Object.isFrozen(SCORE_POINTS)).toBe(true)
  })

  // A form that reorders itself between age groups is how a coach types a
  // conversion into the penalties box, and the total still looks plausible.
  it('⚠️ fixes the order kinds are offered in', () => {
    expect(SCORE_KINDS).toEqual(['tries', 'conversions', 'penalties', 'drops'])
  })
})

describe('scoringForBand — every band the club fields', () => {
  // ⚠️ EVERY SQUAD THE CLUB FIELDS, not a sample. Three thresholds can stand in
  // for fifteen squads only if all fifteen actually agree, and this is the check
  // that says so. The trailing letter is GENDER; the band is the digits.
  const SQUADS = [
    ['u6', 6, ['tries']],
    ['u7', 7, ['tries']],
    ['u8', 8, ['tries']],
    ['u9', 9, ['tries']],
    ['u10', 10, ['tries']],
    ['u11', 11, ['tries']],
    ['u12', 12, ['tries', 'conversions']],
    ['u12g', 12, ['tries', 'conversions']],
    ['u13', 13, ['tries', 'conversions']],
    ['u14b', 14, ['tries', 'conversions', 'penalties', 'drops']],
    ['u14g', 14, ['tries', 'conversions', 'penalties', 'drops']],
    ['u16b', 16, ['tries', 'conversions', 'penalties', 'drops']],
    ['u16g', 16, ['tries', 'conversions', 'penalties', 'drops']],
    ['u18b', 18, ['tries', 'conversions', 'penalties', 'drops']],
    ['u18g', 18, ['tries', 'conversions', 'penalties', 'drops']],
  ]

  for (const [id, band, expected] of SQUADS) {
    it(`${id} scores ${expected.join(', ')}`, () => {
      expect(scoringForBand(band)).toEqual(expected)
    })
  }

  // ⚠️ THE BOUNDARIES ARE THE WHOLE RULE. 11/12 and 13/14 are where the table
  // actually changes, and an off-by-one here hands a U11 squad a kick at goal
  // it does not have in law.
  it('⚠️ changes at 11→12 and at 13→14, not anywhere else', () => {
    expect(scoringForBand(11)).toEqual(['tries'])
    expect(scoringForBand(12)).toEqual(['tries', 'conversions'])
    expect(scoringForBand(13)).toEqual(['tries', 'conversions'])
    expect(scoringForBand(14)).toEqual(['tries', 'conversions', 'penalties', 'drops'])
  })
})

describe('⚠️ the unknown band fails OPEN, unlike allowsOwnContact', () => {
  // The two defaults point in opposite directions on purpose, because the harm
  // is asymmetric in opposite directions. Anyone who unifies them breaks one.
  // Contact details: the bad outcome is a twelve-year-old's phone number.
  // Scoring: the bad outcome is a coach unable to record a kicked drop goal.
  it('gives the FULL set for a null band, not the narrowest', () => {
    expect(scoringForBand(null)).toEqual(['tries', 'conversions', 'penalties', 'drops'])
  })

  it('gives the full set for junk rather than refusing to score', () => {
    for (const junk of [undefined, NaN, 'twelve', {}]) {
      expect(scoringForBand(junk)).toEqual(['tries', 'conversions', 'penalties', 'drops'])
    }
  })

  it('⚠️ a senior side scores everything — null band, adults', () => {
    expect(scoringForTeam({ name: 'Senior Men 1st XV' })).toEqual([
      'tries', 'conversions', 'penalties', 'drops',
    ])
  })
})

describe('scoringForTeam — the club override', () => {
  it('derives from the squad name when there is no override', () => {
    expect(scoringForTeam({ name: 'U10 Tag' })).toEqual(['tries'])
    expect(scoringForTeam({ name: 'U13 Contact' })).toEqual(['tries', 'conversions'])
  })

  // ⚠️ THE TRAP src/lib/ageGroup.js ALREADY CARRIES A NOTE ABOUT. A letter after
  // the digits is GENDER, not a grade, and an earlier regex here returned null
  // for exactly these names.
  it('⚠️ reads U12G and U14B as 12 and 14, because the letter is gender', () => {
    expect(scoringForTeam({ name: 'U12G QR' })).toEqual(['tries', 'conversions'])
    expect(scoringForTeam({ name: 'U14B Contact' })).toEqual([
      'tries', 'conversions', 'penalties', 'drops',
    ])
  })

  it('⚠️ null means USE THE DEFAULT, never "nothing is scoreable"', () => {
    expect(scoringForTeam({ name: 'U10 Tag', scoring_kinds: null })).toEqual(['tries'])
  })

  it('honours a club override over the band default', () => {
    // A U10 festival where the organiser allows conversions.
    expect(scoringForTeam({ name: 'U10 Tag', scoring_kinds: ['tries', 'conversions'] })).toEqual([
      'tries', 'conversions',
    ])
  })

  // ⚠️ THE OVERRIDE IS A COLUMN, NEVER THE NAME — the same rule is_senior and
  // self_registration_allowed carry. Renaming a squad must not change what can
  // be recorded against it.
  it('⚠️ keeps the override when the squad is renamed', () => {
    const override = ['tries']
    expect(scoringForTeam({ name: 'U18B Contact', scoring_kinds: override })).toEqual(['tries'])
  })

  it('normalises an override into SCORE_KINDS order and drops junk', () => {
    expect(cleanScoringKinds(['drops', 'nonsense', 'tries'])).toEqual(['tries', 'drops'])
  })

  it('⚠️ an EMPTY override falls back to tries rather than making scoring impossible', () => {
    expect(cleanScoringKinds([])).toEqual(['tries'])
    expect(scoringForTeam({ name: 'U16B Contact', scoring_kinds: [] })).toEqual(['tries'])
  })
})

describe('totalFor', () => {
  // Four tries and two conversions at U16B: 4*5 + 2*2 = 24.
  it('totals 4 tries + 2 conversions at U16B as 24', () => {
    const u16b = { name: 'U16B Contact' }
    expect(totalFor(u16b, { tries: 4, conversions: 2, penalties: 0, drops: 0 })).toBe(24)
  })

  it('adds penalties and drops at full laws', () => {
    expect(totalFor({ name: 'U18G Contact' }, { tries: 1, penalties: 2, drops: 1 })).toBe(14)
  })

  // ⚠️ An old row carrying penalties for a U10 is data from before a rule
  // changed. Silently adding 3 points to a U10 result is worse than ignoring it.
  it('⚠️ ignores a kind the squad may not score, even when a value is passed', () => {
    expect(totalFor({ name: 'U10 Tag' }, { tries: 2, penalties: 5 })).toBe(10)
  })

  it('treats missing, negative and non-numeric components as zero', () => {
    expect(totalFor({ name: 'U16B Contact' }, { tries: -3, conversions: 'two' })).toBe(0)
    expect(totalFor({ name: 'U16B Contact' }, {})).toBe(0)
    expect(totalFor({ name: 'U16B Contact' }, null)).toBe(0)
  })

  it('floors a fractional component rather than scoring half a try', () => {
    expect(totalFor({ name: 'U16B Contact' }, { tries: 2.9 })).toBe(10)
  })
})

describe('⚠️ hasNoComponents — "not recorded" is not "scored nothing"', () => {
  // This is the predicate that protects live data. The U16B fixture holds
  // result_us 22 / result_them 12 with every component null, typed by hand
  // before components existed. A trigger that recomputed unconditionally would
  // turn a real 22-12 into 0-0 and nothing would report it.
  it('is true when every component is null', () => {
    expect(hasNoComponents({ tries: null, conversions: null, penalties: null, drops: null })).toBe(true)
  })

  it('is true for an empty object — nothing recorded at all', () => {
    expect(hasNoComponents({})).toBe(true)
  })

  it('⚠️ is FALSE for an explicit zero, which is a recorded fact', () => {
    expect(hasNoComponents({ tries: 0, conversions: null, penalties: null, drops: null })).toBe(false)
  })

  it('is false as soon as one component is present', () => {
    expect(hasNoComponents({ tries: null, conversions: 1, penalties: null, drops: null })).toBe(false)
  })
})
