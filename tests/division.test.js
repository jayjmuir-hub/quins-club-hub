// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  DIVISIONS,
  DIVISION_CODES,
  divisionLong,
  divisionShort,
  divisionsFor,
} from '../src/lib/division.js'
import { TIER_OK, tierEligibility } from '../src/lib/tierEligibility.js'

// The 2026–27 senior schedules (3 Sep 2026): a league team's division is a
// CODE, and the word a reader sees for it comes from one table. The junior
// letters keep the wording every screen had before the table existed.

describe('division labels', () => {
  it('leaves the junior letters exactly as they were', () => {
    expect(divisionShort('B')).toBe('Div B')
    expect(divisionLong('B')).toBe('Division B')
  })

  it('names the senior competitions instead of lettering them', () => {
    expect(divisionShort('WAP')).toBe('Premiership')
    expect(divisionLong('WAP')).toBe('West Asia Premiership')
    expect(divisionShort('D1')).toBe('Div 1')
    expect(divisionLong('D2')).toBe('Division 2')
    expect(divisionShort('WXV')).toBe('WXVs')
    expect(divisionLong('W7s')).toBe("Women's 7s")
  })

  it('⚠️ renders an unknown code the old way rather than as nothing', () => {
    // A code added to the database check before it is added to the table
    // must degrade to the pre-table wording, never vanish from a chip.
    expect(divisionShort('X9')).toBe('Div X9')
    expect(divisionLong('X9')).toBe('Division X9')
  })

  it("renders '' for no division, so a renderer can guard on truthiness", () => {
    expect(divisionShort(null)).toBe('')
    expect(divisionShort('')).toBe('')
    expect(divisionLong(undefined)).toBe('')
  })

  it('offers letters to a junior squad and the named competitions to a senior one', () => {
    expect(divisionsFor({ senior: false }).map((d) => d.code)).toEqual(['A', 'B', 'C'])
    expect(divisionsFor({ senior: true }).map((d) => d.code)).toEqual(['WAP', 'D1', 'D2', 'W7s', 'WXV'])
    // Every code is on exactly one of the two lists.
    expect([...divisionsFor({ senior: false }), ...divisionsFor({ senior: true })]).toHaveLength(
      DIVISIONS.length,
    )
    expect(DIVISION_CODES).toHaveLength(8)
  })

  it('⚠️ a senior code on a fixture never invents a grade warning', () => {
    // tierEligibility ranks only A, B and C. A senior tier compared with a
    // junior grade is a question with no answer, and silence is the answer.
    // Control: the junior comparison the function exists for still speaks.
    expect(tierEligibility('WAP', 'C').status).toBe(TIER_OK)
    expect(tierEligibility('D1', 'A').status).toBe(TIER_OK)
    expect(tierEligibility('A', 'C').status).not.toBe(TIER_OK)
  })
})
