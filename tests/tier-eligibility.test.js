// @vitest-environment node
// Nothing here touches the DOM. The rule is in vite.config.js.
//
// The eligibility warning in the lineup picker —
// claude/plans/2026-08-17-lineup-eligibility-warning.md.
import { describe, expect, it } from 'vitest'
import { ABOVE_GRADE, BELOW_GRADE, TIER_OK, tierEligibility } from '../src/lib/tierEligibility.js'

const TIERS = ['A', 'B', 'C']

// Everything a caller can actually hand this function for "no grade" or "no
// tier". `listPlayerGrades` returns a Map, so a miss is `undefined`; a cleared
// grade deletes its row, so nothing ever stores a null tier — but the screen
// reads `grades.get(id)?.tier`, which is `undefined`, and an empty string is what
// a form would hand over. All three must be silence, not a fallback.
const NOTHINGS = [null, undefined, '']

describe('tierEligibility — the exhaustive sweep', () => {
  // ⚠️ EVERY TIER AGAINST EVERY GRADE, because the whole input space is nine
  // pairs and there is no excuse for sampling it. The off-by-one in `cutoffFor`
  // hid on exactly the squads where it did not matter (PR #213); a sweep is what
  // stops the same shape hiding here.
  it('flags exactly the six mismatched pairs and no others', () => {
    const flagged = []
    const quiet = []

    for (const fixture of TIERS) {
      for (const grade of TIERS) {
        const result = tierEligibility(fixture, grade)
        if (result.status === TIER_OK) quiet.push(`${fixture}/${grade}`)
        else flagged.push(`${fixture}/${grade}`)
      }
    }

    // A tier only ever matches itself, so the quiet set is the diagonal.
    expect(quiet.sort()).toEqual(['A/A', 'B/B', 'C/C'])
    expect(flagged.sort()).toEqual(['A/B', 'A/C', 'B/A', 'B/C', 'C/A', 'C/B'])

    // ⚠️ THE CONTROL. A sweep that flags nothing would satisfy the first
    // assertion above only if the expected list were also empty — so this states
    // the count out loud. Six of nine, not zero of nine.
    expect(flagged).toHaveLength(6)
    expect(quiet).toHaveLength(3)
  })

  it('sorts the two directions by which side is stronger', () => {
    // A is the strongest tier, C the weakest.
    expect(tierEligibility('A', 'C').status).toBe(ABOVE_GRADE)
    expect(tierEligibility('A', 'B').status).toBe(ABOVE_GRADE)
    expect(tierEligibility('B', 'C').status).toBe(ABOVE_GRADE)

    expect(tierEligibility('C', 'A').status).toBe(BELOW_GRADE)
    expect(tierEligibility('C', 'B').status).toBe(BELOW_GRADE)
    expect(tierEligibility('B', 'A').status).toBe(BELOW_GRADE)
  })
})

describe('tierEligibility — the silences that keep it usable', () => {
  // ⚠️ THIS IS THE LOAD-BEARING TEST OF THE FEATURE, not an edge case. Most of
  // the club is ungraded. A warning that appears against nearly every name is
  // furniture, and coaches learn to read past it.
  it('says nothing about an ungraded player, at any tier', () => {
    for (const fixture of TIERS) {
      for (const nothing of NOTHINGS) {
        const result = tierEligibility(fixture, nothing)
        expect(result.status).toBe(TIER_OK)
        expect(result.message).toBe('')
      }
    }
  })

  // A friendly has no tier, and must not be counted as one — the same rule
  // `competition_type` NULL already carries on events.
  it('says nothing when the fixture has no tier, at any grade', () => {
    for (const grade of TIERS) {
      for (const nothing of NOTHINGS) {
        const result = tierEligibility(nothing, grade)
        expect(result.status).toBe(TIER_OK)
        expect(result.message).toBe('')
      }
    }
  })

  it('says nothing when it has neither', () => {
    expect(tierEligibility(null, null).status).toBe(TIER_OK)
  })

  // Not defensiveness for its own sake: `events.tier` is a free-ish column and a
  // grade arrives from a Map the screen does not control. An unknown letter must
  // be silence rather than a comparison against NaN.
  it('says nothing about a letter it does not recognise', () => {
    expect(tierEligibility('D', 'A').status).toBe(TIER_OK)
    expect(tierEligibility('A', 'D').status).toBe(TIER_OK)
    expect(tierEligibility('a', 'c').status).toBe(TIER_OK)
  })
})

describe('tierEligibility — the wording', () => {
  it('names both letters, so the warning explains itself', () => {
    const message = tierEligibility('A', 'C').message
    expect(message).toContain('C')
    expect(message).toContain('A tier')
  })

  // ⚠️ JAY'S CALL, 17 Aug 2026: both directions warn, and they are WORDED
  // DIFFERENTLY because they are different worries. Graded below the fixture is a
  // worry about the child; graded above it is the stacking problem an opposition
  // club complains about. One template with the letters swapped would lose that,
  // and would pass a laxer version of this test.
  it('does not say the same thing in both directions', () => {
    const above = tierEligibility('A', 'C').message
    const below = tierEligibility('C', 'A').message

    expect(above).not.toBe(below)
    // The eligibility question belongs to the graded-above case only.
    expect(below.toLowerCase()).toContain('eligib')
    expect(above.toLowerCase()).not.toContain('eligib')
  })

  // ⚠️ THE COLLISION GUARD. This app already uses "playing up" to mean a YOUNGER
  // CHILD IN AN OLDER SQUAD — what `plays_up_confirmed_at` records and what PR
  // #213 was about. Reusing the phrase for tiers would make two unrelated
  // warnings read identically on a coach's screen. Asserted rather than trusted,
  // because it is exactly the phrase a later edit would reach for.
  it('never reuses the age-grade play-up wording', () => {
    for (const fixture of TIERS) {
      for (const grade of TIERS) {
        const message = tierEligibility(fixture, grade).message.toLowerCase()
        expect(message).not.toContain('playing up')
        expect(message).not.toContain('play up')
        expect(message).not.toContain('age group')
      }
    }
  })
})
