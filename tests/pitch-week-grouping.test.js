// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { byPitch } from '../src/components/PitchCalendar.jsx'

// byPitch turns a day's fixtures into "each pitch and what's on it", youngest
// squad first — Jay, 30 Aug 2026: the week view was one undifferentiated pile.
// The age comes from the squad NAME via ageGroup.js, resolved through teamsById.

const teamsById = new Map([
  ['t6', { name: 'U6 Tag' }],
  ['t8', { name: 'U8 Tag' }],
  ['t12', { name: 'U12 Mixed' }],
  ['t14', { name: 'U14 Boys' }],
  ['tsenior', { name: 'Senior Men 1st XV' }],
])

const at = (id, teamId, pitch, hour) => ({
  id,
  team_id: teamId,
  pitch,
  starts_at: `2026-09-05T${String(hour).padStart(2, '0')}:00:00Z`,
  ends_at: null,
})

describe('byPitch', () => {
  it('groups a day by pitch, youngest age group first within each', () => {
    const groups = byPitch(
      [
        at('a', 't14', 'C3', 18), // U14 on C3
        at('b', 't8', 'C3', 18), // U8 on C3 — younger, must come first
        at('c', 't12', 'A1', 18), // U12 on A1
      ],
      teamsById,
    )
    expect(groups.map(([pitch]) => pitch)).toEqual(['A1', 'C3']) // pitch groups in name order
    const c3 = groups.find(([pitch]) => pitch === 'C3')[1]
    expect(c3.map((e) => e.id)).toEqual(['b', 'a']) // U8 before U14, whatever the input order
  })

  it('sends a booking waiting for a pitch to its own group, last', () => {
    const groups = byPitch(
      [
        at('waiting', 't12', null, 18), // no pitch
        at('tbd', 't8', 'Pitch TBD', 18), // the placeholder counts as waiting too
        at('real', 't14', 'D1', 18),
      ],
      teamsById,
    )
    const keys = groups.map(([pitch]) => pitch)
    expect(keys[keys.length - 1]).toBe('') // the waiting group is last
    const waiting = groups.find(([pitch]) => pitch === '')[1]
    expect(waiting.map((e) => e.id).sort()).toEqual(['tbd', 'waiting']) // both no-pitch bookings land here
  })

  it('sorts a senior side (no age band) after the youth bands', () => {
    const groups = byPitch(
      [
        at('senior', 'tsenior', 'A1', 18),
        at('u6', 't6', 'A1', 18),
      ],
      teamsById,
    )
    const a1 = groups.find(([pitch]) => pitch === 'A1')[1]
    expect(a1.map((e) => e.id)).toEqual(['u6', 'senior']) // youngest first, seniors last
  })
})
