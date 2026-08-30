// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { pitchBar, diagramSlots, diagramWeek } from '../src/lib/pitchOccupancy.js'

// The pitch-layout diagram builders — the data behind the day and week share
// pictures. They answer "draw me the ground": every pitch with something on it
// at one moment, carved into the portions its squads take, with the spare as its
// own segment. The occupancy MATH (shareSegments/occupancyStatus) is proven in
// pitch-shares.test.js and pitch-portion.test.js; this pins the SHAPE the cards
// consume — slots by start time, pitches within, fan-out dedup, spare and over.

const ev = (iso, pitch, portion, extra = {}) => ({
  id: extra.id ?? `${pitch}-${portion}-${iso}`,
  starts_at: iso,
  ends_at: null,
  pitch,
  pitch_portion: portion,
  team_name: extra.team_name ?? 'A squad',
  ...extra,
})

describe('pitchBar', () => {
  it('carves a full pitch into four quarters — full, nothing spare, widest first', () => {
    const bar = pitchBar('D1', [
      ev('2026-08-31T14:00:00Z', 'D1', 'quarter', { id: 'a', team_name: 'U6 Tag' }),
      ev('2026-08-31T14:00:00Z', 'D1', 'quarter', { id: 'b', team_name: 'U7 Tag' }),
      ev('2026-08-31T14:00:00Z', 'D1', 'quarter', { id: 'c', team_name: 'U8 Tag' }),
      ev('2026-08-31T14:00:00Z', 'D1', 'quarter', { id: 'd', team_name: 'U9 Mixed' }),
    ])
    expect(bar.pitch).toBe('D1')
    expect(bar.segments).toHaveLength(4)
    expect(bar.load).toBeCloseTo(1)
    expect(bar.spareFraction).toBeCloseTo(0)
    expect(bar.over).toBe(false)
    expect(bar.statusText).toBe('Full — nothing spare')
    expect(bar.segments.map((s) => s.squad)).toEqual(['U6 Tag', 'U7 Tag', 'U8 Tag', 'U9 Mixed'])
    expect(bar.segments.every((s) => s.portionShort === '¼')).toBe(true)
    expect(bar.spoken).toContain('D1:')
    expect(bar.spoken).toContain('Full — nothing spare')
  })

  it('labels a club-wide booking "Club", not the bare "A squad" fallback', () => {
    // A whole-club event (team_id null, no squad) shows on the pitch layout when
    // it has a pitch; without this it read "A squad" → the card abbreviated it to
    // a bare "A" (Jay, 30 Aug 2026).
    const bar = pitchBar('D4', [
      ev('2026-09-02T14:00:00Z', 'D4', 'full', { id: 'club', team_name: null, team_id: null }),
    ])
    expect(bar.segments.map((s) => s.squad)).toEqual(['Club'])
  })

  it('draws a quarter beside a half as ¾ used with a quarter spare, half first', () => {
    const bar = pitchBar('D2', [
      ev('2026-08-31T14:00:00Z', 'D2', 'quarter', { id: 'a', team_name: 'U8 Tag' }),
      ev('2026-08-31T14:00:00Z', 'D2', 'half', { id: 'b', team_name: 'U14 Boys' }),
    ])
    expect(bar.segments.map((s) => s.squad)).toEqual(['U14 Boys', 'U8 Tag']) // widest first
    expect(bar.load).toBeCloseTo(0.75)
    expect(bar.spareFraction).toBeCloseTo(0.25)
    expect(bar.over).toBe(false)
    expect(bar.statusText).toBe('three quarters used · a quarter free')
  })

  it('flags an overload — three halves overflow one pitch, no spare', () => {
    const bar = pitchBar('D3', [
      ev('2026-08-31T14:00:00Z', 'D3', 'half', { id: 'a' }),
      ev('2026-08-31T14:00:00Z', 'D3', 'half', { id: 'b' }),
      ev('2026-08-31T14:00:00Z', 'D3', 'half', { id: 'c' }),
    ])
    expect(bar.load).toBeCloseTo(1.5)
    expect(bar.over).toBe(true)
    expect(bar.spareFraction).toBeCloseTo(0)
    expect(bar.statusText).toContain('Over by')
  })

  it('counts a fan-out (shared group_id) once, so its spare is real', () => {
    const bar = pitchBar('A1', [
      ev('2026-08-31T14:00:00Z', 'A1', 'half', { id: 'x', group_id: 'g1', team_name: 'U10' }),
      ev('2026-08-31T14:00:00Z', 'A1', 'half', { id: 'y', group_id: 'g1', team_name: 'U12' }),
    ])
    expect(bar.segments).toHaveLength(1)
    expect(bar.load).toBeCloseTo(0.5)
    expect(bar.spareFraction).toBeCloseTo(0.5)
  })
})

describe('diagramSlots', () => {
  it('groups by start time (earliest first), then by pitch name numerically', () => {
    const slots = diagramSlots([
      ev('2026-08-31T16:30:00Z', 'D2', 'full', { id: 'late' }),
      ev('2026-08-31T14:00:00Z', 'D10', 'full', { id: 'earlyD10' }),
      ev('2026-08-31T14:00:00Z', 'D2', 'full', { id: 'earlyD2' }),
    ])
    expect(slots).toHaveLength(2)
    expect(slots[0].timeMs).toBeLessThan(slots[1].timeMs)
    // D2 before D10 — numeric, not lexicographic.
    expect(slots[0].pitches.map((p) => p.pitch)).toEqual(['D2', 'D10'])
    expect(slots[1].pitches.map((p) => p.pitch)).toEqual(['D2'])
  })

  it('ignores a booking with no pitch (the screen strips TBD before calling in)', () => {
    const slots = diagramSlots([
      ev('2026-08-31T14:00:00Z', '', 'full', { id: 'blank' }),
      ev('2026-08-31T14:00:00Z', '   ', 'full', { id: 'spaces', pitch: '   ' }),
      ev('2026-08-31T14:00:00Z', 'D1', 'full', { id: 'real' }),
    ])
    expect(slots).toHaveLength(1)
    expect(slots[0].pitches).toHaveLength(1)
    expect(slots[0].pitches[0].pitch).toBe('D1')
  })

  it('is empty for no events', () => {
    expect(diagramSlots([], new Map())).toEqual([])
    expect(diagramSlots(null)).toEqual([])
  })
})

describe('diagramWeek', () => {
  it('aligns to the given days and flags the quiet ones as empty', () => {
    const days = [
      { year: 2026, month: 7, day: 31 }, // Mon 31 Aug (month is 0-based: 7 = Aug)
      { year: 2026, month: 8, day: 1 }, // Tue 1 Sep
      { year: 2026, month: 8, day: 2 }, // Wed 2 Sep — nothing
    ]
    const week = diagramWeek(
      [
        ev('2026-08-31T14:00:00Z', 'D1', 'full', { id: 'mon' }),
        ev('2026-09-01T14:00:00Z', 'D2', 'half', { id: 'tue' }),
      ],
      days,
      new Map(),
    )
    expect(week).toHaveLength(3)
    expect(week[0].empty).toBe(false)
    expect(week[0].dayParts.day).toBe(31)
    expect(week[0].slots[0].pitches[0].pitch).toBe('D1')
    expect(week[1].empty).toBe(false)
    expect(week[1].slots[0].pitches[0].pitch).toBe('D2')
    expect(week[2].empty).toBe(true)
    expect(week[2].slots).toEqual([])
  })
})
