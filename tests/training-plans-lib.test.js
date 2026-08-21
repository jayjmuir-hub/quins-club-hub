// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  totalMinutes, totalWarning, drillFitsTemplate, squadFitsTemplate, describePublishRow,
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
})

describe('describePublishRow', () => {
  it('reads the three outcomes', () => {
    expect(describePublishRow({ will_write: 3, skipped_coach_edited: 1, no_events: 0 })).toBe('3 sessions will get the plan · 1 kept (coach edited)')
    expect(describePublishRow({ will_write: 1, skipped_coach_edited: 0, no_events: 0 })).toBe('1 session will get the plan')
    expect(describePublishRow({ will_write: 0, skipped_coach_edited: 0, no_events: 1 })).toBe('No training in this range')
  })
})
