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

const at = (iso, extra = {}) => ({
  id: extra.id ?? iso,
  starts_at: iso,
  ends_at: null,
  pitch: 'Pitch 2',
  ...extra,
})

describe('findPitchClashes', () => {
  it('reports two events overlapping on one pitch', () => {
    const clashes = findPitchClashes([
      at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T10:30:00Z' }),
      at('2026-09-05T10:00:00Z', { id: 'b', ends_at: '2026-09-05T11:30:00Z' }),
    ])
    expect(clashes).toHaveLength(1)
    expect(clashes[0].pitch).toBe('Pitch 2')
    expect([clashes[0].a.id, clashes[0].b.id].sort()).toEqual(['a', 'b'])
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
    // BY CONSTRUCTION (the 5 Aug fan-out decision). Reporting those would make
    // every multi-squad fixture look double-booked.
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

  it('reports every pair when three overlap, not just the first', () => {
    const clashes = findPitchClashes([
      at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T12:00:00Z' }),
      at('2026-09-05T10:00:00Z', { id: 'b', ends_at: '2026-09-05T12:00:00Z' }),
      at('2026-09-05T11:00:00Z', { id: 'c', ends_at: '2026-09-05T12:00:00Z' }),
    ])
    expect(clashes).toHaveLength(3)
  })

  it('survives rubbish rather than throwing', () => {
    expect(findPitchClashes(null)).toEqual([])
    expect(findPitchClashes([])).toEqual([])
    expect(findPitchClashes([at('not-a-date', { id: 'a' }), at('2026-09-05T09:00:00Z', { id: 'b' })])).toEqual([])
  })
})
