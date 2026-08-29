// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { pitchShares, PITCH_TBD } from '../src/data/pitches.js'

// pitchShares — the occupancy view's data. Where findPitchClashes returns only
// the overloaded shares, this returns EVERY share (two or more squads on one
// pitch at one time), so the calendar can draw how full a pitch is and how much
// is free. The tricky cases are all about what counts as a share.

const at = (iso, extra = {}) => ({
  id: extra.id ?? iso,
  starts_at: iso,
  ends_at: null,
  pitch: 'Pitch 2',
  ...extra,
})

describe('pitchShares', () => {
  it('reports a quarter-and-a-half share that fits, with its load', () => {
    const shares = pitchShares([
      at('2026-09-05T09:00:00Z', { id: 'u8', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'quarter' }),
      at('2026-09-05T09:00:00Z', { id: 'u10', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'half' }),
    ])
    expect(shares).toHaveLength(1)
    expect(shares[0].pitch).toBe('Pitch 2')
    expect(shares[0].load).toBeCloseTo(0.75)
    expect(shares[0].events.map((e) => e.id).sort()).toEqual(['u10', 'u8'])
  })

  it('includes an overflowing share — it is a share AND a clash', () => {
    const shares = pitchShares([
      at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'half' }),
      at('2026-09-05T09:00:00Z', { id: 'b', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'half' }),
      at('2026-09-05T09:00:00Z', { id: 'c', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'half' }),
    ])
    expect(shares).toHaveLength(1)
    expect(shares[0].load).toBeCloseTo(1.5)
  })

  it('is empty when a pitch has a single booking — nothing is shared', () => {
    expect(
      pitchShares([at('2026-09-05T09:00:00Z', { id: 'solo', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'full' })]),
    ).toEqual([])
  })

  it('⚠️ a pure fan-out is NOT a share — one session, one occupant', () => {
    expect(
      pitchShares([
        at('2026-09-05T09:00:00Z', { id: 'u10', ends_at: '2026-09-05T10:00:00Z', group_id: 'g1', pitch_portion: 'full' }),
        at('2026-09-05T09:00:00Z', { id: 'u12', ends_at: '2026-09-05T10:00:00Z', group_id: 'g1', pitch_portion: 'full' }),
      ]),
    ).toEqual([])
  })

  it('a fan-out beside a DIFFERENT squad is a share of two occupants', () => {
    const shares = pitchShares([
      at('2026-09-05T09:00:00Z', { id: 'u10', ends_at: '2026-09-05T10:00:00Z', group_id: 'g1', pitch_portion: 'half' }),
      at('2026-09-05T09:00:00Z', { id: 'u12', ends_at: '2026-09-05T10:00:00Z', group_id: 'g1', pitch_portion: 'half' }),
      at('2026-09-05T09:00:00Z', { id: 'seniors', ends_at: '2026-09-05T10:00:00Z', pitch_portion: 'half' }),
    ])
    expect(shares).toHaveLength(1)
    // The fan-out counts once (½), plus the seniors' ½ = a full pitch.
    expect(shares[0].load).toBeCloseTo(1)
    expect(shares[0].events.map((e) => e.id).sort()).toEqual(['seniors', 'u10', 'u12'])
  })

  it('keeps only the maximal window when overlaps nest', () => {
    // a covers b covers c: {a,b} at 10:00 and {a,b,c} at 11:00 — only the peak.
    const shares = pitchShares([
      at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T12:00:00Z', pitch_portion: 'quarter' }),
      at('2026-09-05T10:00:00Z', { id: 'b', ends_at: '2026-09-05T12:00:00Z', pitch_portion: 'quarter' }),
      at('2026-09-05T11:00:00Z', { id: 'c', ends_at: '2026-09-05T12:00:00Z', pitch_portion: 'quarter' }),
    ])
    expect(shares).toHaveLength(1)
    expect(shares[0].events.map((e) => e.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('ignores TBD and pitch-less bookings, and survives rubbish', () => {
    expect(
      pitchShares([
        at('2026-09-05T09:00:00Z', { id: 'a', ends_at: '2026-09-05T10:00:00Z', pitch: PITCH_TBD }),
        at('2026-09-05T09:00:00Z', { id: 'b', ends_at: '2026-09-05T10:00:00Z', pitch: PITCH_TBD }),
      ]),
    ).toEqual([])
    expect(pitchShares(null)).toEqual([])
    expect(pitchShares([])).toEqual([])
  })
})
