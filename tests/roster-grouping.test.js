import { describe, it, expect } from 'vitest'
import {
  buildRosterGroups,
  constantColumns,
  GROUP_BY,
  UNGRADED,
} from '../src/lib/rosterGrouping.js'

// Jay, 14 Aug 2026, from the U16B coach view: "it would also help to be able to
// view players grouped by tier grade, then by back or forward". Two shapes were
// mocked for him — nested headings, and one level plus a FWD/BCK chip — and he
// picked NESTED ("option A"), with no fallback for small squads.
//
// ⚠️ NAMES INVENTED. CLAUDE.md rule 9.

const forwardA = { id: 'p1', full_name: 'Aled Fenwicke', unit: 'forward', position: 'Prop' }
const backA = { id: 'p2', full_name: 'Bruno Castellani', unit: 'back', position: 'Wing' }
const forwardB = { id: 'p3', full_name: 'Caspar Nyholm', unit: 'forward', position: 'Lock' }
const ungraded = { id: 'p4', full_name: 'Rory Aldenbrook', unit: null, position: null }

const tiers = new Map([
  ['p1', 'A'],
  ['p2', 'A'],
  ['p3', 'B'],
])

describe('nested grouping — tier, then forward/back', () => {
  it('nests units inside each tier, in tier order', () => {
    const groups = buildRosterGroups([backA, forwardB, forwardA, ungraded], {
      groupBy: GROUP_BY.TIER,
      tierByPlayer: tiers,
    })

    expect(groups.map((g) => g.label)).toEqual(['Tier A', 'Tier B', 'Not graded'])
    expect(groups[0].sections.map((s) => s.label)).toEqual(['Forwards', 'Backs'])
    expect(groups[0].sections[0].players.map((p) => p.id)).toEqual(['p1'])
    expect(groups[0].sections[1].players.map((p) => p.id)).toEqual(['p2'])
  })

  it('⚠️ does NOT render an empty sub-group heading', () => {
    // Tier B here holds only forwards. An empty "Backs" heading underneath it
    // reads as a bug rather than as an absence, which is why the filtering lives
    // in the grouping rule and not in the screen.
    const groups = buildRosterGroups([forwardB], {
      groupBy: GROUP_BY.TIER,
      tierByPlayer: tiers,
    })
    expect(groups[0].sections.map((s) => s.label)).toEqual(['Forwards'])
  })

  it('puts ungraded players LAST and never drops them', () => {
    // ⚠️ THE ONES A COACH MOST NEEDS TO SEE. The point of grading is partly to
    // notice who has not been graded, so they get their own group at the foot
    // rather than falling out of the list.
    const groups = buildRosterGroups([ungraded, forwardA], {
      groupBy: GROUP_BY.TIER,
      tierByPlayer: tiers,
    })
    expect(groups.at(-1).key).toBe(UNGRADED)
    expect(groups.at(-1).sections[0].players.map((p) => p.id)).toEqual(['p4'])
  })

  it('sorts by name within a section', () => {
    const zed = { id: 'p9', full_name: 'Zane Okonkwo', unit: 'forward' }
    const groups = buildRosterGroups([zed, forwardA], {
      groupBy: GROUP_BY.TIER,
      tierByPlayer: new Map([['p1', 'A'], ['p9', 'A']]),
    })
    expect(groups[0].sections[0].players.map((p) => p.full_name)).toEqual([
      'Aled Fenwicke',
      'Zane Okonkwo',
    ])
  })
})

describe('single-level grouping uses the same shape', () => {
  it('wraps one level in one unnamed section, so the screen has one render path', () => {
    const groups = buildRosterGroups([forwardA, backA], { groupBy: GROUP_BY.UNIT })
    expect(groups.map((g) => g.label)).toEqual(['Forwards', 'Backs'])
    expect(groups[0].sections).toHaveLength(1)
    // A null label is the signal to suppress the sub-heading.
    expect(groups[0].sections[0].label).toBeNull()
  })
})

describe('constantColumns', () => {
  const readers = {
    gender: (p) => p.gender,
    team: (p) => p.team_id,
  }

  it('hides a column whose value is the same on every row', () => {
    // ⚠️ ONE RULE INSTEAD OF TWO SPECIAL CASES. Jay named gender on a
    // single-gender squad and age group when filtered to one squad; both are the
    // same thing — a column that repeats itself tells the reader nothing.
    const rows = [
      { gender: 'male', team_id: 't1' },
      { gender: 'male', team_id: 't1' },
    ]
    expect([...constantColumns(rows, readers)].sort()).toEqual(['gender', 'team'])
  })

  it('keeps a column the moment one row differs', () => {
    const rows = [
      { gender: 'male', team_id: 't1' },
      { gender: 'female', team_id: 't1' },
    ]
    const hidden = constantColumns(rows, readers)
    expect(hidden.has('gender')).toBe(false)
    expect(hidden.has('team')).toBe(true)
  })

  it('⚠️ treats a MISSING value as a difference, which is what surfaces the gap', () => {
    // A single-gender squad with one player whose gender is unset has two
    // distinct values, so the column stays. That is deliberate: it is exactly
    // the row a coach needs to fix. The screen additionally nudges about it.
    const rows = [{ gender: 'male' }, { gender: null }]
    expect(constantColumns(rows, { gender: (p) => p.gender }).has('gender')).toBe(false)
  })

  it('hides nothing when there are no rows at all', () => {
    // ⚠️ Hiding every column on an empty list would make the table look broken
    // at the exact moment somebody is wondering why it is empty.
    expect(constantColumns([], readers).size).toBe(0)
  })
})
