// @vitest-environment node
// Reaches @supabase/supabase-js, which needs a global WebSocket. That is why
// this file sat in jsdom until 15 Aug 2026: CI pinned Node 20, where WebSocket
// is not a global. CI now runs Node 24, matching both dev PCs.
import { describe, it, expect } from 'vitest'
import { findPitchClashes, PITCH_TBD } from '../src/data/pitches.js'

// Clash detection over the managed pitch list.
//
// `claude/state-of-play.md` carried "a managed pitch list is the precondition
// for clash detection" from 4 Aug. This is the thing that precondition was
// for, and the interesting cases are all about what must NOT be reported —
// a detector that cries wolf gets switched off within a week.
//
// ⚠️ IT RETURNS GROUPS, NOT PAIRS. A pitch is a capacity, not a slot: the
// question is whether the portions booked at one moment overtop a whole pitch,
// which is a property of the whole overlapping SET, not of any two members.
// Each result is `{ pitch, load, events }`; a helper collapses one to the set
// of event ids it involves, which is all either screen consumes.

const at = (iso, extra = {}) => ({
  id: extra.id ?? iso,
  starts_at: iso,
  ends_at: null,
  pitch: 'Pitch 2',
  ...extra,
})

// The set of event ids caught up in any reported overload — how both Allocation
// and PitchGlance actually use the result.
const flaggedIds = (events) => {
  const ids = new Set()
  for (const clash of findPitchClashes(events)) for (const e of clash.events) ids.add(e.id)
  return [...ids].sort()
}

describe('findPitchClashes', () => {
  it('reports two full-pitch events overlapping on one pitch', () => {
    const clashes = findPitchClashes([
      at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T10:30:00Z' }),
      at('2026-09-05T10:00:00Z', { id: 'b', ends_at: '2026-09-05T11:30:00Z' }),
    ])
    expect(clashes).toHaveLength(1)
    expect(clashes[0].pitch).toBe('Pitch 2')
    expect(clashes[0].events.map((e) => e.id).sort()).toEqual(['a', 'b'])
    // No portions set → each counts as a whole pitch → two overtop one.
    expect(clashes[0].load).toBe(2)
  })

  it('⚠️ touching is not overlapping', () => {
    // One session ending at 10:00 and the next starting at 10:00 share a pitch
    // cleanly. That is how a club actually runs a Saturday, and reporting it
    // would flag every back-to-back booking.
    expect(
      findPitchClashes([
        at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T10:00:00Z' }),
        at('2026-09-05T10:00:00Z', { id: 'b', ends_at: '2026-09-05T11:00:00Z' }),
      ]),
    ).toEqual([])
  })

  it('ignores different pitches at the same time', () => {
    expect(
      findPitchClashes([
        at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T11:00:00Z', pitch: 'Pitch 2' }),
        at('2026-09-05T09:00:00Z', { id: 'b', ends_at: '2026-09-05T11:00:00Z', pitch: 'Pitch 3' }),
      ]),
    ).toEqual([])
  })

  it('⚠️ never reports the Pitch TBD placeholder', () => {
    // It is more than half the fixtures. "Not allocated yet" cannot clash, and
    // treating it as a pitch would bury every real clash under one pile-up.
    expect(
      findPitchClashes([
        at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T11:00:00Z', pitch: PITCH_TBD }),
        at('2026-09-05T09:30:00Z', { id: 'b', ends_at: '2026-09-05T11:00:00Z', pitch: PITCH_TBD }),
      ]),
    ).toEqual([])
  })

  it('ignores events with no pitch at all', () => {
    expect(
      findPitchClashes([
        at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T11:00:00Z', pitch: null }),
        at('2026-09-05T09:30:00Z', { id: 'b', ends_at: '2026-09-05T11:00:00Z', pitch: '  ' }),
      ]),
    ).toEqual([])
  })

  it('⚠️ A MULTI-SQUAD FAN-OUT IS NOT A CLASH', () => {
    // The one that would have killed the feature. A multi-squad session is one
    // event PER SQUAD sharing a group_id, on the same pitch at the same time
    // BY CONSTRUCTION (the 5 Aug fan-out decision). It is ONE occupation of the
    // ground, so its portion is counted once — three full-pitch rows here still
    // sum to one pitch, not three.
    const clashes = findPitchClashes([
      at('2026-09-05T09:00:00Z', { id: 'u10', ends_at: '2026-09-05T11:00:00Z', group_id: 'g1' }),
      at('2026-09-05T09:00:00Z', { id: 'u12', ends_at: '2026-09-05T11:00:00Z', group_id: 'g1' }),
      at('2026-09-05T09:00:00Z', { id: 'u14', ends_at: '2026-09-05T11:00:00Z', group_id: 'g1' }),
    ])
    expect(clashes).toEqual([])
  })

  it('still reports a real clash against a fan-out from a DIFFERENT group', () => {
    // The other half of the rule: same group is fine, different groups on the
    // same pitch at the same time is exactly what Pitch Management needs to see.
    const clashes = findPitchClashes([
      at('2026-09-05T09:00:00Z', { id: 'u10', ends_at: '2026-09-05T11:00:00Z', group_id: 'g1' }),
      at('2026-09-05T09:30:00Z', { id: 'seniors', ends_at: '2026-09-05T11:00:00Z', group_id: 'g2' }),
    ])
    expect(clashes).toHaveLength(1)
    expect(flaggedIds([
      at('2026-09-05T09:00:00Z', { id: 'u10', ends_at: '2026-09-05T11:00:00Z', group_id: 'g1' }),
      at('2026-09-05T09:30:00Z', { id: 'seniors', ends_at: '2026-09-05T11:00:00Z', group_id: 'g2' }),
    ])).toEqual(['seniors', 'u10'])
  })

  it('⚠️ with no end time, only an identical start counts', () => {
    // ends_at is nullable. An event with no end has no duration to overlap
    // with, and assuming one would invent a clash — or invent the absence of
    // one — from data nobody entered.
    expect(
      findPitchClashes([
        at('2026-09-05T09:00:00Z', { id: 'a' }),
        at('2026-09-05T09:30:00Z', { id: 'b' }),
      ]),
    ).toEqual([])

    expect(
      findPitchClashes([
        at('2026-09-05T09:00:00Z', { id: 'a' }),
        at('2026-09-05T09:00:00Z', { id: 'b' }),
      ]),
    ).toHaveLength(1)
  })

  it('⚠️ a no-end booking does NOT clash with a timed one that merely covers it', () => {
    // The half-open sibling of the rule above: a booking with no duration is
    // present only at its own start instant, so a timed session running across
    // that instant is not something it can be said to overlap. Only a booking
    // that STARTS at the same moment counts.
    expect(
      findPitchClashes([
        at('2026-09-05T09:00:00Z', { id: 'timed', ends_at: '2026-09-05T11:00:00Z' }),
        at('2026-09-05T10:00:00Z', { id: 'noend' }),
      ]),
    ).toEqual([])
  })

  it('reports the nested situations when three full pitches overlap', () => {
    // a covers b covers c. There are two distinct overloads — {a,b} from 10:00
    // and {a,b,c} from 11:00 — and every one of the three is caught up in one.
    const events = [
      at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T12:00:00Z' }),
      at('2026-09-05T10:00:00Z', { id: 'b', ends_at: '2026-09-05T12:00:00Z' }),
      at('2026-09-05T11:00:00Z', { id: 'c', ends_at: '2026-09-05T12:00:00Z' }),
    ]
    expect(flaggedIds(events)).toEqual(['a', 'b', 'c'])
  })

  it('survives rubbish rather than throwing', () => {
    expect(findPitchClashes(null)).toEqual([])
    expect(findPitchClashes([])).toEqual([])
    expect(findPitchClashes([at('not-a-date', { id: 'a' }), at('2026-09-05T09:00:00Z', { id: 'b' })])).toEqual([])
  })

  // ── Portions: the whole point of the feature ──────────────────────────────

  it('⚠️ a quarter beside a half is NOT a clash — they fit on one pitch', () => {
    // The case the old detector got wrong and this feature exists to fix: two
    // age groups genuinely sharing one pitch, ¼ + ½ = ¾ of a pitch.
    expect(
      findPitchClashes([
        at('2026-09-05T09:00:00Z', { id: 'u8', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'quarter' }),
        at('2026-09-05T09:00:00Z', { id: 'u10', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'half' }),
      ]),
    ).toEqual([])
  })

  it('portions that add up to exactly one pitch are not a clash', () => {
    // ¼ + ½ + ¼ = a full pitch, cleanly shared.
    expect(
      findPitchClashes([
        at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'quarter' }),
        at('2026-09-05T09:00:00Z', { id: 'b', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'half' }),
        at('2026-09-05T09:00:00Z', { id: 'c', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'quarter' }),
      ]),
    ).toEqual([])
  })

  it('⚠️ three thirds share a pitch cleanly — the non-dyadic case', () => {
    // ⅓ + ⅓ + ⅓ sums to 0.999… in floating point, NOT exactly 1, so without the
    // capacity EPSILON this legitimate full-pitch share would read as an
    // over-capacity clash. This is the reason the epsilon exists (Jay, 30 Aug
    // 2026 — thirds are the first non-dyadic portion).
    expect(
      findPitchClashes([
        at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'third' }),
        at('2026-09-05T09:00:00Z', { id: 'b', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'third' }),
        at('2026-09-05T09:00:00Z', { id: 'c', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'third' }),
      ]),
    ).toEqual([])
  })

  it('two thirds and a half overtop one pitch', () => {
    // ⅓ + ⅓ + ½ = 1⅙ pitches — over capacity, so all three are flagged.
    const events = [
      at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'third' }),
      at('2026-09-05T09:00:00Z', { id: 'b', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'third' }),
      at('2026-09-05T09:00:00Z', { id: 'c', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'half' }),
    ]
    const clashes = findPitchClashes(events)
    expect(clashes).toHaveLength(1)
    expect(clashes[0].load).toBeCloseTo(7 / 6)
    expect(flaggedIds(events)).toEqual(['a', 'b', 'c'])
  })

  it('portions that overtop one pitch ARE a clash, and name everyone on it', () => {
    // ¼ + ½ + ½ = 1¼ pitches: it no longer fits, and all three are involved.
    const events = [
      at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'quarter' }),
      at('2026-09-05T09:00:00Z', { id: 'b', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'half' }),
      at('2026-09-05T09:00:00Z', { id: 'c', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'half' }),
    ]
    const clashes = findPitchClashes(events)
    expect(clashes).toHaveLength(1)
    expect(clashes[0].load).toBeCloseTo(1.25)
    expect(flaggedIds(events)).toEqual(['a', 'b', 'c'])
  })

  it('a full pitch leaves no room for even a quarter', () => {
    expect(
      findPitchClashes([
        at('2026-09-05T09:00:00Z', { id: 'full', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'full' }),
        at('2026-09-05T09:00:00Z', { id: 'quarter', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'quarter' }),
      ]),
    ).toHaveLength(1)
  })
})
