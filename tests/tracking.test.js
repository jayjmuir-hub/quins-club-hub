// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { attendancePercent, buildTracking, squadSummary } from '../src/lib/tracking.js'

// src/lib/tracking.js — the Squad Hub's season grid maths.
//
// ⚠️ THE TESTS THAT MATTER are the ones that would FAIL against the tempting
// wrong implementations:
//   - a percentage that counts `excused` as an absence (the ranked-list-of-
//     the-injured failure the attendance module warns about);
//   - a no-show count computed from EITHER table alone rather than the pair;
//   - a grid that invents a status for a missing row instead of showing the
//     gap.

// Invented names — this repo is public and its members are mostly children.
const PLAYERS = [
  { id: 'p1', full_name: 'Ines Vukovic' },
  { id: 'p2', full_name: 'Tomas Aldana' },
]
const EVENTS = [
  { id: 'e-old', starts_at: '2026-08-01T16:00:00Z', type: 'training' },
  { id: 'e-new', starts_at: '2026-08-15T16:00:00Z', type: 'match' },
]

describe('attendancePercent', () => {
  it('is present / (present + absent)', () => {
    expect(attendancePercent({ present: 3, absent: 1 })).toBe(75)
  })

  it('excludes excused from BOTH sides — an injured player is not "absent"', () => {
    // Against the injected fault "excused counts as absent": that
    // implementation returns 50 here, this one must return 100.
    expect(attendancePercent({ present: 2, absent: 0, excused: 2 })).toBe(100)
  })

  it('returns null, not 0, when nothing was ever recorded', () => {
    // 0 would read as "never turns up"; null is "unknown".
    expect(attendancePercent({ present: 0, absent: 0 })).toBe(null)
    expect(attendancePercent()).toBe(null)
  })
})

describe('buildTracking', () => {
  it('sorts events newest first and pairs both tables per cell', () => {
    const { events, rows } = buildTracking({
      players: PLAYERS,
      events: EVENTS,
      availabilityRows: [{ event_id: 'e-new', player_id: 'p1', status: 'in' }],
      attendanceRows: [{ event_id: 'e-new', player_id: 'p1', status: 'present' }],
    })
    expect(events.map((e) => e.id)).toEqual(['e-new', 'e-old'])
    expect(rows[0].cells.get('e-new')).toEqual({ availability: 'in', attendance: 'present' })
  })

  it('counts a no-show ONLY when said-in meets marked-absent', () => {
    // The fixture DISCRIMINATES: p1 said in and was absent (a no-show); p2
    // was absent without replying (not a no-show); p1 also said in and came
    // (not a no-show). An implementation reading either table alone gets a
    // different count for at least one player.
    const { rows } = buildTracking({
      players: PLAYERS,
      events: EVENTS,
      availabilityRows: [
        { event_id: 'e-old', player_id: 'p1', status: 'in' },
        { event_id: 'e-new', player_id: 'p1', status: 'in' },
      ],
      attendanceRows: [
        { event_id: 'e-old', player_id: 'p1', status: 'absent' },
        { event_id: 'e-new', player_id: 'p1', status: 'present' },
        { event_id: 'e-old', player_id: 'p2', status: 'absent' },
      ],
    })
    const [p1, p2] = rows
    expect(p1.noShows).toBe(1)
    expect(p2.noShows).toBe(0)
    expect(p1.percent).toBe(50)
    expect(p2.percent).toBe(0)
  })

  it('leaves missing rows missing — no invented status', () => {
    const { rows } = buildTracking({
      players: PLAYERS,
      events: EVENTS,
      availabilityRows: [],
      attendanceRows: [{ event_id: 'e-new', player_id: 'p1', status: 'present' }],
    })
    expect(rows[0].cells.get('e-new')).toEqual({ availability: undefined, attendance: 'present' })
    expect(rows[0].cells.has('e-old')).toBe(false)
    expect(rows[1].percent).toBe(null)
  })

  it('ignores rows for events outside the grid rather than counting the invisible', () => {
    const { rows } = buildTracking({
      players: PLAYERS,
      events: [EVENTS[1]],
      availabilityRows: [{ event_id: 'e-old', player_id: 'p1', status: 'in' }],
      attendanceRows: [{ event_id: 'e-old', player_id: 'p1', status: 'absent' }],
    })
    expect(rows[0].noShows).toBe(0)
    expect(rows[0].percent).toBe(null)
  })
})

describe('squadSummary', () => {
  it('applies the same excused-exclusion as the per-player figure', () => {
    const { rows } = buildTracking({
      players: PLAYERS,
      events: EVENTS,
      availabilityRows: [{ event_id: 'e-new', player_id: 'p2', status: 'in' }],
      attendanceRows: [
        { event_id: 'e-new', player_id: 'p1', status: 'present' },
        { event_id: 'e-old', player_id: 'p1', status: 'excused' },
        { event_id: 'e-new', player_id: 'p2', status: 'absent' },
      ],
    })
    const summary = squadSummary(rows)
    expect(summary).toEqual({ present: 1, absent: 1, excused: 1, noShows: 1, percent: 50 })
  })
})
