// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  totalMinutes, totalWarning, drillFitsTemplate, squadFitsTemplate, describePublishRow,
  ageOrNull, textOrNull, bandLabel, ageDraftProblem,
} from '../src/lib/trainingPlans.js'

const T = { min_age: 9, max_age: 13, requires_contact: true }

describe('totals', () => {
  it('sums block minutes and ignores junk', () => {
    expect(totalMinutes([{ minutes: 15 }, { minutes: 20 }, { minutes: 'x' }, {}])).toBe(35)
  })
  it('is silent at 60 and names the arithmetic otherwise', () => {
    expect(totalWarning([{ minutes: 30 }, { minutes: 30 }])).toBeNull()
    expect(totalWarning([{ minutes: 15 }, { minutes: 20 }, { minutes: 30 }])).toBe('This is 65 minutes, not 60. Save anyway?')
    expect(totalWarning([{ minutes: 50 }])).toBe('This is 50 minutes, not 60. Save anyway?')
  })
})

describe('drillFitsTemplate', () => {
  it('accepts a drill whose band overlaps and whose contact matches', () => {
    expect(drillFitsTemplate({ min_age: 10, max_age: null, requires_contact: false }, T).ok).toBe(true)
  })
  it('refuses a contact drill on a tag template, with the reason', () => {
    const r = drillFitsTemplate({ requires_contact: true }, { ...T, requires_contact: false })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/contact/i)
  })
  it('refuses a drill whose minimum age is above the template band', () => {
    expect(drillFitsTemplate({ min_age: 14 }, T).ok).toBe(false)
  })
})

describe('squadFitsTemplate', () => {
  it('refuses an unparseable squad name and SAYS SO — never a default band', () => {
    const r = squadFitsTemplate({ name: 'Senior Men', requires_contact: true }, T)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/can.t tell/i)
  })
  it('refuses a tag squad for a contact template', () => {
    const r = squadFitsTemplate({ name: 'U12 Mixed', requires_contact: false }, T)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/tag/i)
  })
  it('allows a tag template on a contact squad', () => {
    expect(squadFitsTemplate({ name: 'U12 Mixed', requires_contact: true }, { ...T, requires_contact: false }).ok).toBe(true)
  })
  it('refuses a squad outside the band, naming it', () => {
    const r = squadFitsTemplate({ name: 'U16B', requires_contact: true }, T)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/U9.*U13/)
  })
  it('does not read the B in U14B as anything but a squad', () => {
    expect(squadFitsTemplate({ name: 'U12B', requires_contact: true }, T).ok).toBe(true)
  })
  // ⚠️ THE SENIOR SQUAD. A template that sets no age has nothing to compare a
  // band against, so an unparseable name is not a refusal — it is irrelevant.
  it('lets an age-less template reach a squad whose name carries no band', () => {
    const anyAge = { min_age: null, max_age: null, requires_contact: true }
    expect(squadFitsTemplate({ name: 'Senior Men', requires_contact: true }, anyAge).ok).toBe(true)
  })
  it('still refuses a tag squad for that same age-less contact template', () => {
    const anyAge = { min_age: null, max_age: null, requires_contact: true }
    const r = squadFitsTemplate({ name: 'U12 Mixed', requires_contact: false }, anyAge)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/tag/i)
  })
  // ...and the null band is NOT a default: put an age on the template and the
  // unparseable name is refused again, with the reason.
  it('refuses a squad with no band when the template DOES set an age', () => {
    const r = squadFitsTemplate({ name: 'Senior Men', requires_contact: true }, T)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/can.t tell/i)
  })
  it('calls the thing being fitted whatever the caller calls it', () => {
    const r = squadFitsTemplate({ name: 'U16B', requires_contact: true }, T, 'session')
    expect(r.reason).toMatch(/this session's/)
    expect(r.reason).not.toMatch(/template/)
  })
})

describe('describePublishRow', () => {
  it('reads the three outcomes', () => {
    expect(describePublishRow({ will_write: 3, skipped_coach_edited: 1, no_events: 0 })).toBe('3 sessions will get the plan · 1 kept (coach edited)')
    expect(describePublishRow({ will_write: 1, skipped_coach_edited: 0, no_events: 0 })).toBe('1 session will get the plan')
    expect(describePublishRow({ will_write: 0, skipped_coach_edited: 0, no_events: 1 })).toBe('No training in this range')
  })
})

// The three coercion helpers the four training screens all import. They were
// byte-identical copies in each screen until 21 Aug 2026.
describe('the hoisted helpers', () => {
  it('ageOrNull sends a blank box as NULL, never 0 — the between 4 and 19 check', () => {
    expect(ageOrNull('')).toBeNull()
    expect(ageOrNull('   ')).toBeNull()
    expect(ageOrNull('12')).toBe(12)
    expect(ageOrNull('nope')).toBeNull()
  })
  it('textOrNull turns "not said" into NULL rather than an empty string', () => {
    expect(textOrNull('  ')).toBeNull()
    expect(textOrNull(null)).toBeNull()
    expect(textOrNull('  a note ')).toBe('a note')
  })
  it('bandLabel is the standalone form, capitalised', () => {
    expect(bandLabel(9, 13)).toBe('U9–U13')
    expect(bandLabel(13, null)).toBe('U13 and up')
    expect(bandLabel(null, 13)).toBe('up to U13')
    expect(bandLabel(null, null)).toBe('Any age')
  })
})

// Mirrors the DB checks (min_age/max_age between 4 and 19, min <= max) so a
// typo like 99 is caught in the form instead of surfacing as a raw
// `drills_min_age_check` error — the 21 Aug review follow-up.
describe('ageDraftProblem', () => {
  it('is silent when both boxes are blank, or one end is', () => {
    expect(ageDraftProblem('', '')).toBeNull()
    expect(ageDraftProblem('9', '')).toBeNull()
    expect(ageDraftProblem('', '13')).toBeNull()
  })
  it('is silent on a legal band', () => {
    expect(ageDraftProblem('4', '19')).toBeNull()
    expect(ageDraftProblem('9', '9')).toBeNull()
  })
  it('names the 4–19 range for a typo like 99, at either end', () => {
    expect(ageDraftProblem('99', '')).toBe('Ages are 4 to 19')
    expect(ageDraftProblem('', '99')).toBe('Ages are 4 to 19')
    expect(ageDraftProblem('3', '')).toBe('Ages are 4 to 19')
    expect(ageDraftProblem('9.5', '')).toBe('Ages are 4 to 19')
    expect(ageDraftProblem('nope', '')).toBe('Ages are 4 to 19')
  })
  it('refuses youngest above oldest', () => {
    expect(ageDraftProblem('13', '9')).toBe('Youngest is above oldest')
  })
})
