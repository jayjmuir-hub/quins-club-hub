// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { groupHubTeams, hubTeamLine, squadHubNavItems, squadMark } from '../src/lib/squadHub.js'

// ⚠️ DELIBERATELY SHUFFLED — U14 before U8 despite sort_order. Grouping
// must re-assert club order inside each bucket, the same fault the 21 Aug
// picker showed as insertion order.

const TEAMS = [
  { id: 't-u14', name: 'U14B', sort_order: 5 },
  { id: 't-u12', name: 'U12 Mixed', sort_order: 3 },
  { id: 't-u8', name: 'U8 Tag', sort_order: 1 },
]

describe('groupHubTeams', () => {
  it('puts a multi-squad manager in yours, in club order, with nothing in rest', () => {
    const memberships = [
      { role: 'manager', team_id: 't-u14', status: 'active' },
      { role: 'manager', team_id: 't-u12', status: 'active' },
    ]
    const { yours, rest, all } = groupHubTeams(memberships, TEAMS)
    expect(yours.map((t) => t.name)).toEqual(['U12 Mixed', 'U14B'])
    expect(rest).toEqual([])
    expect(all.map((t) => t.id)).toEqual(['t-u12', 't-u14'])
  })

  it('puts an admin parent’s own squad first, then the rest of the club', () => {
    const memberships = [
      { role: 'admin', admin_rights: ['clubadmin'], team_id: null, status: 'active' },
      { role: 'parent', team_id: 't-u8', status: 'active', player_id: 'p-child' },
    ]
    const { yours, rest } = groupHubTeams(memberships, TEAMS)
    expect(yours.map((t) => t.name)).toEqual(['U8 Tag'])
    expect(rest.map((t) => t.name)).toEqual(['U12 Mixed', 'U14B'])
  })

  it('does not put every squad in yours for a club-only admin', () => {
    const memberships = [{ role: 'admin', admin_rights: ['clubadmin'], team_id: null, status: 'active' }]
    const { yours, rest } = groupHubTeams(memberships, TEAMS)
    expect(yours).toEqual([])
    expect(rest.map((t) => t.name)).toEqual(['U8 Tag', 'U12 Mixed', 'U14B'])
  })

  it('leaves a parent-only account with nothing openable', () => {
    const memberships = [
      { role: 'parent', team_id: 't-u12', status: 'active', player_id: 'p1' },
    ]
    const { yours, rest, all } = groupHubTeams(memberships, TEAMS)
    expect(all).toEqual([])
    expect(yours).toEqual([])
    expect(rest).toEqual([])
  })
})

describe('hubTeamLine', () => {
  it('names the team-scoped role on yours, not Admin', () => {
    const memberships = [
      { role: 'admin', admin_rights: ['clubadmin'], team_id: null, status: 'active' },
      { role: 'parent', team_id: 't-u8', status: 'active', player_id: 'p-child' },
    ]
    expect(hubTeamLine(memberships, TEAMS[2])).toBe('Parent')
  })

  it('prefers Coach over Parent when both sit on the same squad', () => {
    const memberships = [
      { role: 'coach', team_id: 't-u12', status: 'active' },
      { role: 'parent', team_id: 't-u12', status: 'active', player_id: 'p1' },
    ]
    expect(hubTeamLine(memberships, { id: 't-u12', name: 'U12 Mixed' })).toBe('Coach')
  })

  it('uses Mighty Minis / Club squad on the rest of the club', () => {
    const memberships = [{ role: 'admin', admin_rights: ['clubadmin'], team_id: null, status: 'active' }]
    expect(hubTeamLine(memberships, { id: 't-u8', name: 'U8 Tag' })).toBe('Mighty Minis')
    expect(hubTeamLine(memberships, { id: 't-u12', name: 'U12 Mixed' })).toBe('Club squad')
  })
})

describe('squadHubNavItems', () => {
  const U14B = { id: 't-u14', name: 'U14B', sort_order: 5, is_senior: false }
  const U13 = { id: 't-u13', name: 'U13 Mixed', sort_order: 4, is_senior: false }
  const MEN = { id: 't-men', name: 'Senior Men - 1st XV', sort_order: 20, is_senior: true }
  const ALL = [U13, U14B, MEN]

  it('puts Call-ups on a senior hub and never Play-ups', () => {
    const items = squadHubNavItems({
      teamId: MEN.id,
      team: MEN,
      memberships: [{ role: 'coach', team_id: MEN.id, status: 'active', is_head_coach: true }],
      teams: ALL,
    })
    expect(items.map((i) => i.label)).toEqual(['Overview', 'Match roster', 'Training', 'Call-ups', 'Chat'])
    expect(items.find((i) => i.label === 'Call-ups').to).toBe(`/squad/${MEN.id}/callups`)
  })

  it('puts Play-ups on a junior hub for the head coach, never Call-ups', () => {
    const items = squadHubNavItems({
      teamId: U14B.id,
      team: U14B,
      memberships: [{ role: 'coach', team_id: U14B.id, status: 'active', is_head_coach: true }],
      teams: ALL,
    })
    expect(items.map((i) => i.label)).toContain('Play-ups')
    expect(items.map((i) => i.label)).not.toContain('Call-ups')
    expect(items.find((i) => i.label === 'Play-ups').to).toBe(`/squad/${U14B.id}/playups`)
  })

  it('hides Play-ups from an assistant coach, medic, and untagged staff', () => {
    for (const row of [
      { role: 'coach', team_id: U14B.id, status: 'active', is_head_coach: false },
      { role: 'medic', team_id: U14B.id, status: 'active' },
      { role: 'coach', team_id: U14B.id, status: 'active' },
    ]) {
      const items = squadHubNavItems({
        teamId: U14B.id,
        team: U14B,
        memberships: [row],
        teams: ALL,
      })
      expect(items.map((i) => i.label), row.role).not.toContain('Play-ups')
    }
  })

  it('shows Play-ups to the age-group manager', () => {
    const items = squadHubNavItems({
      teamId: U13.id,
      team: U13,
      memberships: [{ role: 'manager', team_id: U13.id, status: 'active' }],
      teams: ALL,
    })
    expect(items.map((i) => i.label)).toContain('Play-ups')
  })
})

describe('squadMark', () => {
  it('takes the U-band, and initials when there is none', () => {
    expect(squadMark('U13 Mixed')).toBe('U13')
    expect(squadMark('U12G QR')).toBe('U12')
    expect(squadMark('Senior Men')).toBe('SM')
  })
})
