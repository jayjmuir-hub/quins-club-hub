// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { sectionLabel, sectionLong, sectionsFor, teamsInSection } from '../src/lib/section.js'

// claude/plans/2026-09-03-senior-section.md. `teams.section` is a column an
// admin sets; this lib only turns it into words and decides which switch
// pills to draw. Nothing here grants anything — RLS does.

const TEAMS = [
  { id: 'men1', name: 'Senior Men - 1st XV', section: 'senior_men', sort_order: 16 },
  { id: 'men2', name: 'Senior Men - 2nd XV', section: 'senior_men', sort_order: 17 },
  { id: 'women', name: 'Senior Women', section: 'senior_women', sort_order: 19 },
  // ⚠️ A junior squad whose NAME contains "Men" — must never count as a section.
  { id: 'u14', name: 'U14 Mentors Squad', section: null, sort_order: 5 },
]

describe('sections', () => {
  it('names the two sections', () => {
    expect(sectionLabel('senior_men')).toBe('Men')
    expect(sectionLong('senior_women')).toBe('Senior women')
    expect(sectionLabel('nope')).toBe('')
  })

  it('lists a section’s squads in the club’s order, by the column and never the name', () => {
    expect(teamsInSection(TEAMS, 'senior_men').map((t) => t.id)).toEqual(['men1', 'men2'])
    expect(teamsInSection(TEAMS, 'senior_women').map((t) => t.id)).toEqual(['women'])
    expect(teamsInSection(TEAMS, null)).toEqual([])
  })

  it('a player belongs to the sections of their ACTIVE squads', () => {
    const memberships = [
      { team_id: 'men2', status: 'active', role: 'player' },
      { team_id: 'women', status: 'pending', role: 'player' },
    ]
    expect(sectionsFor(memberships, TEAMS)).toEqual({ mine: ['senior_men'], all: ['senior_men', 'senior_women'] })
  })

  it('a junior parent belongs to no section, and still sees both listed for fixtures', () => {
    expect(sectionsFor([{ team_id: 'u14', status: 'active', role: 'parent' }], TEAMS)).toEqual({
      mine: [],
      all: ['senior_men', 'senior_women'],
    })
  })

  it('an admin belongs to none and sees every section that exists', () => {
    expect(sectionsFor([{ team_id: null, status: 'active', role: 'admin' }], TEAMS, { admin: true })).toEqual({
      mine: [],
      all: ['senior_men', 'senior_women'],
    })
    expect(sectionsFor([], [{ id: 'x', name: 'Senior Men - 1st XV', section: 'senior_men' }], { admin: true }).all).toEqual(['senior_men'])
  })
})
