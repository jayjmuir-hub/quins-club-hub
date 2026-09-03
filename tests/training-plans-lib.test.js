// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  totalMinutes, totalWarning, drillFitsTemplate, squadFitsTemplate, describePublishRow,
  ageOrNull, textOrNull, bandLabel, ageDraftProblem, summariseUptake, describeUptake,
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
  // ⚠️ AGE IS GUIDANCE, NOT A GATE — since 2 Sep 2026 (a coach, via Jay:
  // "should not be age group locked"). The band mismatch is still SAID, in
  // `guidance`, but `ok` stays true. Only contact refuses.
  it('allows a drill whose minimum age is above the template band, with guidance', () => {
    const r = drillFitsTemplate({ min_age: 14 }, T)
    expect(r.ok).toBe(true)
    expect(r.reason).toBeNull()
    expect(r.guidance).toBe('Drill is for U14 and up; template is U9–U13')
  })
  it('gives no guidance for an in-band drill', () => {
    expect(drillFitsTemplate({ min_age: 10, max_age: 12 }, T).guidance).toBeNull()
  })
  it('a contact refusal carries no age guidance — one sentence, the one that matters', () => {
    const r = drillFitsTemplate({ requires_contact: true, min_age: 14 }, { ...T, requires_contact: false })
    expect(r.ok).toBe(false)
    expect(r.guidance).toBeNull()
  })
})

describe('squadFitsTemplate', () => {
  // ⚠️ THE NULL BAND IS NOT A REFUSAL ANY MORE — since 2 Sep 2026. A name with
  // no band in it ("Senior Men") is never "outside" anything, so it is allowed
  // with no guidance. It used to be refused by anything that set an age,
  // which left senior coaches a thinner library than juniors.
  it('allows an unparseable squad name, with no guidance — nothing to be outside of', () => {
    const r = squadFitsTemplate({ name: 'Senior Men', requires_contact: true }, T)
    expect(r.ok).toBe(true)
    expect(r.reason).toBeNull()
    expect(r.guidance).toBeNull()
  })
  it('refuses a tag squad for a contact template', () => {
    const r = squadFitsTemplate({ name: 'U12 Mixed', requires_contact: false }, T)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/tag/i)
  })
  it('allows a tag template on a contact squad', () => {
    expect(squadFitsTemplate({ name: 'U12 Mixed', requires_contact: true }, { ...T, requires_contact: false }).ok).toBe(true)
  })
  it('allows a squad outside the band, naming the band as guidance', () => {
    const r = squadFitsTemplate({ name: 'U16B', requires_contact: true }, T)
    expect(r.ok).toBe(true)
    expect(r.reason).toBeNull()
    expect(r.guidance).toBe("U16 is outside this template's U9–U13")
  })
  it('gives no guidance for a squad inside the band', () => {
    expect(squadFitsTemplate({ name: 'U12B', requires_contact: true }, T).guidance).toBeNull()
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
  // ⚠️ THE CONTACT HALF IS UNCHANGED BY THE AGE LOOSENING. A tag squad is
  // refused whatever the band says, and the refusal carries no age guidance.
  it('still refuses a tag squad outside the band, on contact alone', () => {
    const r = squadFitsTemplate({ name: 'U16G', requires_contact: false }, T)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/tag/i)
    expect(r.guidance).toBeNull()
  })
  it('calls the thing being fitted whatever the caller calls it', () => {
    const r = squadFitsTemplate({ name: 'U16B', requires_contact: true }, T, 'session')
    expect(r.guidance).toMatch(/this session's/)
    expect(r.guidance).not.toMatch(/template/)
  })
})

describe('describePublishRow', () => {
  it('reads the three outcomes', () => {
    // suggest_training's rows since 2 Sep 2026: a suggestion, never a plan.
    expect(describePublishRow({ will_suggest: 3, unchanged: 1, no_events: 0 })).toBe('3 sessions will get the suggestion · 1 already has it')
    expect(describePublishRow({ will_suggest: 1, unchanged: 2, no_events: 0 })).toBe('1 session will get the suggestion · 2 already have it')
    expect(describePublishRow({ will_suggest: 1, unchanged: 0, no_events: 0 })).toBe('1 session will get the suggestion')
    expect(describePublishRow({ will_suggest: 0, unchanged: 0, no_events: 1 })).toBe('No training in this range')
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

describe('summariseUptake / describeUptake', () => {
  const row = (team, status, extra = {}) => ({
    status, decided_at: '2026-09-01T10:00:00Z', decline_note: null,
    event: { team_id: team, session: null }, ...extra,
  })
  it('buckets per squad and counts adjusted only when the coach saved AFTER accepting', () => {
    const rows = [
      row('a', 'accepted', { event: { team_id: 'a', session: { coach_edited_at: '2026-09-01T10:00:00Z' } } }),
      row('a', 'accepted', { event: { team_id: 'a', session: { coach_edited_at: '2026-09-02T10:00:00Z' } } }),
      // PostgREST may hand the unique-FK embed back as a one-element array.
      row('a', 'accepted', { event: { team_id: 'a', session: [{ coach_edited_at: '2026-09-03T10:00:00Z' }] } }),
      row('a', 'declined', { decline_note: '  too much contact ' }),
      row('a', 'declined', { decline_note: '' }),
      row('b', 'pending', { decided_at: null }),
    ]
    const out = summariseUptake(rows)
    expect(out).toEqual([
      { team_id: 'a', total: 5, accepted: 3, adjusted: 2, declined: 2, pending: 0, notes: ['too much contact'] },
      { team_id: 'b', total: 1, accepted: 0, adjusted: 0, declined: 0, pending: 1, notes: [] },
    ])
    expect(describeUptake(out[0])).toBe('3 accepted (2 adjusted) · 2 declined')
    expect(describeUptake(out[1])).toBe('1 unanswered')
    expect(describeUptake({ total: 0 })).toBe('Nothing suggested')
    expect(describeUptake({ total: 1, accepted: 1, adjusted: 0, declined: 0, pending: 0 })).toBe('1 accepted')
  })
  it('skips a row with no squad and is empty-safe', () => {
    expect(summariseUptake([{ status: 'pending', event: null }])).toEqual([])
    expect(summariseUptake(undefined)).toEqual([])
  })
})
