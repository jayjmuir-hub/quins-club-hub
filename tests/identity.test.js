import { describe, it, expect } from 'vitest'
import { OFFICER_TITLES, identityBadges } from '../src/lib/identity.js'

// The DM header's badge order (claude/plans/2026-08-26-dm-identity-rows.md):
// super-admin first, then squad staff by age-group order wearing their REAL
// title, then parent with squads grouped, then player. Multiple rights are
// the point — the fixture is the live shape that started this: a club admin
// who is also assistant coach of two squads.

const row = (role, { title = null, is_super = false, squad = null, squad_sort = null } = {}) => ({
  role,
  title,
  is_super,
  squad,
  squad_sort,
})

describe('identityBadges', () => {
  it('the multi-hat: admin first, then each squad title in age order', () => {
    expect(
      identityBadges([
        row('coach', { title: 'Assistant Coach', squad: 'U18B', squad_sort: 12 }),
        row('admin', { is_super: true }),
        row('coach', { title: 'Assistant Coach', squad: 'U16B', squad_sort: 10 }),
      ]),
    ).toEqual([
      { label: 'Club Hub admin', tone: 'admin' },
      { label: 'U16B Assistant Coach', tone: 'staff' },
      { label: 'U18B Assistant Coach', tone: 'staff' },
    ])
  })

  it('a bare staff role falls back to its role label', () => {
    expect(identityBadges([row('manager', { squad: 'U10', squad_sort: 3 })])).toEqual([
      { label: 'U10 Team Manager', tone: 'staff' },
    ])
  })

  it('parents and players group their squads onto one badge', () => {
    expect(
      identityBadges([
        row('parent', { squad: 'U12', squad_sort: 5 }),
        row('parent', { squad: 'U10', squad_sort: 3 }),
        row('player', { squad: 'U16B', squad_sort: 10 }),
      ]),
    ).toEqual([
      { label: 'Parent', tone: 'family', squads: 'U10, U12' },
      { label: 'Player', tone: 'family', squads: 'U16B' },
    ])
  })

  it('duplicate membership rows produce one badge — the U10-twice live case', () => {
    expect(
      identityBadges([
        row('coach', { title: 'Assistant Coach', squad: 'U16B', squad_sort: 10 }),
        row('coach', { title: 'Assistant Coach', squad: 'U16B', squad_sort: 10 }),
        row('parent', { squad: 'U10', squad_sort: 3 }),
        row('parent', { squad: 'U10', squad_sort: 3 }),
      ]),
    ).toEqual([
      { label: 'U16B Assistant Coach', tone: 'staff' },
      { label: 'Parent', tone: 'family', squads: 'U10' },
    ])
  })

  // Club officers (claude/plans/2026-08-26-club-officers.md): titles without
  // rights, FIRST in the row, in Jay's stated dignity order — never the
  // order the database happened to return them.
  it('officer titles lead, in dignity order, ahead of the admin badge', () => {
    expect(
      identityBadges([
        row('coach', { title: 'Assistant Coach', squad: 'U16B', squad_sort: 10 }),
        row('officer', { title: 'Treasurer' }),
        row('admin', { is_super: true }),
        row('officer', { title: 'Club President' }),
      ]),
    ).toEqual([
      { label: 'Club President', tone: 'officer' },
      { label: 'Treasurer', tone: 'officer' },
      { label: 'Club Hub admin', tone: 'admin' },
      { label: 'U16B Assistant Coach', tone: 'staff' },
    ])
  })

  it('a duplicate officer row renders once; an unknown officer title still renders, last', () => {
    expect(
      identityBadges([
        row('officer', { title: 'Club Secretary' }),
        row('officer', { title: 'Club Secretary' }),
        row('officer', { title: 'ZZ Future Title' }),
      ]),
    ).toEqual([
      { label: 'Club Secretary', tone: 'officer' },
      { label: 'ZZ Future Title', tone: 'officer' },
    ])
  })

  it('Club Captain is the tenth known title, ranked last so it sorts ahead of an unknown one', () => {
    expect(OFFICER_TITLES[OFFICER_TITLES.length - 1]).toBe('Club Captain')
    expect(OFFICER_TITLES).toHaveLength(10)
    const badges = identityBadges([
      row('officer', { title: 'ZZ Grand Vizier' }),
      row('officer', { title: 'Club Captain' }),
    ])
    expect(badges.map((b) => b.label)).toEqual(['Club Captain', 'ZZ Grand Vizier'])
  })

  it('empty or missing rows mean no badges, never a throw', () => {
    expect(identityBadges([])).toEqual([])
    expect(identityBadges(null)).toEqual([])
  })
})
