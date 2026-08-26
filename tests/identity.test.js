import { describe, it, expect } from 'vitest'
import { identityBadges } from '../src/lib/identity.js'

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

  it('empty or missing rows mean no badges, never a throw', () => {
    expect(identityBadges([])).toEqual([])
    expect(identityBadges(null)).toEqual([])
  })
})
