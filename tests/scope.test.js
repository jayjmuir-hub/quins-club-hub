// @vitest-environment node
// Reaches @supabase/supabase-js, which needs a global WebSocket. That is why
// this file sat in jsdom until 15 Aug 2026: CI pinned Node 20, where WebSocket
// is not a global. CI now runs Node 24, matching both dev PCs.
import { describe, it, expect, vi } from 'vitest'
import {
  visibleTeams,
  canEditTeam,
  isAdmin,
  roleLabel,
  childPlayerIds,
  SQUAD_STAFF_ROLES,
  isSquadStaffRole,
} from '../src/lib/scope.js'

// Unit tests for src/lib/scope.js (Task 7: pure membership/scope helpers) and
// src/data/members.js (loadMyMemberships()). scope.js must stay pure — no
// supabase, react, or auth imports — so these run with fixture membership
// arrays only. loadMyMemberships() is tested separately below with a mocked
// supabase client; no network is touched anywhere in this file.

// --- Fixture teams: 15 real age groups, unsorted on purpose so tests prove
// visibleTeams sorts rather than merely passing through insertion order.
const U6 = { id: 'team-u6', club_id: 'club-1', name: 'U6', sort_order: 1 }
const U8 = { id: 'team-u8', club_id: 'club-1', name: 'U8', sort_order: 3 }
const U12 = { id: 'team-u12', club_id: 'club-1', name: 'U12', sort_order: 7 }
const U16 = { id: 'team-u16', club_id: 'club-1', name: 'U16', sort_order: 11 }
const SENIOR_1XV = {
  id: 'team-senior-1xv',
  club_id: 'club-1',
  name: 'Senior Men 1st XV',
  sort_order: 13,
}
const ALL_TEAMS = [SENIOR_1XV, U16, U8, U12, U6] // deliberately unsorted

function membership(overrides) {
  return {
    id: `m-${Math.random()}`,
    profile_id: 'profile-1',
    club_id: 'club-1',
    team_id: null,
    role: 'player',
    player_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('visibleTeams', () => {
  it('returns every team for an admin, even though the admin membership has team_id null', () => {
    const memberships = [membership({ role: 'admin', team_id: null })]

    const result = visibleTeams(memberships, ALL_TEAMS)

    expect(result.map((t) => t.id)).toEqual([U6.id, U8.id, U12.id, U16.id, SENIOR_1XV.id])
  })

  it('returns only the teams a coach with two squads coaches, sorted by sort_order', () => {
    const memberships = [
      membership({ role: 'coach', team_id: U12.id }),
      membership({ role: 'coach', team_id: U6.id }),
    ]

    const result = visibleTeams(memberships, ALL_TEAMS)

    expect(result.map((t) => t.id)).toEqual([U6.id, U12.id])
  })

  it('returns only the parent\'s child team', () => {
    const memberships = [
      membership({ role: 'parent', team_id: U8.id, player_id: 'player-child-1' }),
    ]

    const result = visibleTeams(memberships, ALL_TEAMS)

    expect(result.map((t) => t.id)).toEqual([U8.id])
  })

  it('unions teams for a person holding both coach and parent roles', () => {
    const memberships = [
      membership({ role: 'coach', team_id: U12.id }),
      membership({ role: 'parent', team_id: U8.id, player_id: 'player-child-1' }),
    ]

    const result = visibleTeams(memberships, ALL_TEAMS)

    expect(result.map((t) => t.id)).toEqual([U8.id, U12.id])
  })

  it('does not mutate the allTeams array passed in', () => {
    const original = [...ALL_TEAMS]
    const memberships = [membership({ role: 'admin', team_id: null })]

    visibleTeams(memberships, ALL_TEAMS)

    expect(ALL_TEAMS).toEqual(original)
    expect(ALL_TEAMS.map((t) => t.id)).toEqual(original.map((t) => t.id))
  })

  it('returns an empty array for empty, null, or undefined memberships', () => {
    expect(visibleTeams([], ALL_TEAMS)).toEqual([])
    expect(visibleTeams(null, ALL_TEAMS)).toEqual([])
    expect(visibleTeams(undefined, ALL_TEAMS)).toEqual([])
  })

  it('handles a null or undefined allTeams without throwing', () => {
    const memberships = [membership({ role: 'admin', team_id: null })]

    expect(visibleTeams(memberships, null)).toEqual([])
    expect(visibleTeams(memberships, undefined)).toEqual([])
  })

  it('sorts deterministically even when a team is missing sort_order', () => {
    // Regression: a.sort_order - b.sort_order is NaN if either side is
    // null/undefined, which comparator functions handle inconsistently.
    // (a.sort_order ?? 0) - (b.sort_order ?? 0) keeps the result numeric.
    const teamWithoutOrder = { id: 'team-no-order', club_id: 'club-1', name: 'Mystery XV' }
    const teams = [U12, teamWithoutOrder, U6]
    const memberships = [membership({ role: 'admin', team_id: null })]

    const result = visibleTeams(memberships, teams)

    // teamWithoutOrder falls back to sort_order 0, before U6 (1) and U12 (7).
    expect(result.map((t) => t.id)).toEqual([teamWithoutOrder.id, U6.id, U12.id])
  })
})

describe('canEditTeam', () => {
  it('is true for an admin on any team', () => {
    const memberships = [membership({ role: 'admin', team_id: null })]

    expect(canEditTeam(memberships, U6.id)).toBe(true)
    expect(canEditTeam(memberships, SENIOR_1XV.id)).toBe(true)
  })

  it('is true for a coach only on their own coached teams', () => {
    const memberships = [
      membership({ role: 'coach', team_id: U12.id }),
      membership({ role: 'coach', team_id: U6.id }),
    ]

    expect(canEditTeam(memberships, U12.id)).toBe(true)
    expect(canEditTeam(memberships, U6.id)).toBe(true)
    expect(canEditTeam(memberships, U8.id)).toBe(false)
  })

  it('is false for a parent, even on their child\'s team', () => {
    const memberships = [
      membership({ role: 'parent', team_id: U8.id, player_id: 'player-child-1' }),
    ]

    expect(canEditTeam(memberships, U8.id)).toBe(false)
  })

  it('is false for a player on their own team', () => {
    const memberships = [membership({ role: 'player', team_id: U8.id, player_id: 'player-1' })]

    expect(canEditTeam(memberships, U8.id)).toBe(false)
  })

  it('is true for a coach+parent holder only on the coached team', () => {
    const memberships = [
      membership({ role: 'coach', team_id: U12.id }),
      membership({ role: 'parent', team_id: U8.id, player_id: 'player-child-1' }),
    ]

    expect(canEditTeam(memberships, U12.id)).toBe(true)
    expect(canEditTeam(memberships, U8.id)).toBe(false)
  })

  it('is false for empty, null, or undefined memberships', () => {
    expect(canEditTeam([], U6.id)).toBe(false)
    expect(canEditTeam(null, U6.id)).toBe(false)
    expect(canEditTeam(undefined, U6.id)).toBe(false)
  })

  it('is true for an admin on a real team id, but false for an admin on a null teamId', () => {
    const memberships = [membership({ role: 'admin', team_id: null })]

    expect(canEditTeam(memberships, U12.id)).toBe(true)
    expect(canEditTeam(memberships, null)).toBe(false)
  })

  it('is false for a null or undefined teamId even for an admin or coach', () => {
    const adminMemberships = [membership({ role: 'admin', team_id: null })]
    const coachMemberships = [membership({ role: 'coach', team_id: U12.id })]

    expect(canEditTeam(adminMemberships, null)).toBe(false)
    expect(canEditTeam(adminMemberships, undefined)).toBe(false)
    expect(canEditTeam(coachMemberships, null)).toBe(false)
    expect(canEditTeam(coachMemberships, undefined)).toBe(false)
  })

  it('does not let a malformed coach row with team_id null match a null teamId', () => {
    // Regression: m.team_id === teamId would be true if both sides were
    // null. Coach rows always carry a real team_id in production, but the
    // helper must not rely on that — the null-teamId guard closes this off.
    const memberships = [membership({ role: 'coach', team_id: null })]

    expect(canEditTeam(memberships, null)).toBe(false)
  })
})

describe('isAdmin', () => {
  it('is true when any membership row has role admin', () => {
    const memberships = [
      membership({ role: 'coach', team_id: U12.id }),
      membership({ role: 'admin', team_id: null }),
    ]

    expect(isAdmin(memberships)).toBe(true)
  })

  it('is false when no row has role admin', () => {
    const memberships = [membership({ role: 'coach', team_id: U12.id })]

    expect(isAdmin(memberships)).toBe(false)
  })

  it('is false for empty, null, or undefined memberships', () => {
    expect(isAdmin([])).toBe(false)
    expect(isAdmin(null)).toBe(false)
    expect(isAdmin(undefined)).toBe(false)
  })
})

describe('roleLabel', () => {
  it('returns Admin when an admin row is present, regardless of other roles', () => {
    const memberships = [
      membership({ role: 'coach', team_id: U12.id }),
      membership({ role: 'admin', team_id: null }),
    ]

    expect(roleLabel(memberships)).toBe('Admin')
  })

  it('returns Coach for a coach+parent holder (coach outranks parent)', () => {
    const memberships = [
      membership({ role: 'coach', team_id: U12.id }),
      membership({ role: 'parent', team_id: U8.id, player_id: 'player-child-1' }),
    ]

    expect(roleLabel(memberships)).toBe('Coach')
  })

  it('returns Parent for a parent-only holder', () => {
    const memberships = [
      membership({ role: 'parent', team_id: U8.id, player_id: 'player-child-1' }),
    ]

    expect(roleLabel(memberships)).toBe('Parent')
  })

  it('returns Player for a player-only holder', () => {
    const memberships = [membership({ role: 'player', team_id: U8.id, player_id: 'player-1' })]

    expect(roleLabel(memberships)).toBe('Player')
  })

  it('returns Parent for a parent+player holder (parent outranks player)', () => {
    const memberships = [
      membership({ role: 'parent', team_id: U8.id, player_id: 'player-child-1' }),
      membership({ role: 'player', team_id: U16.id, player_id: 'player-self-1' }),
    ]

    expect(roleLabel(memberships)).toBe('Parent')
  })

  it('falls back to "No access yet" when the only role value is unrecognised', () => {
    const memberships = [membership({ role: 'treasurer', team_id: null, player_id: null })]

    expect(roleLabel(memberships)).toBe('No access yet')
  })

  it('returns "No access yet" for empty, null, or undefined memberships', () => {
    expect(roleLabel([])).toBe('No access yet')
    expect(roleLabel(null)).toBe('No access yet')
    expect(roleLabel(undefined)).toBe('No access yet')
  })
})

describe('childPlayerIds', () => {
  it('returns the linked player_id for a parent membership', () => {
    const memberships = [
      membership({ role: 'parent', team_id: U8.id, player_id: 'player-child-1' }),
    ]

    expect(childPlayerIds(memberships)).toEqual(['player-child-1'])
  })

  it('includes player-role player_ids alongside parent-role ones', () => {
    const memberships = [
      membership({ role: 'parent', team_id: U8.id, player_id: 'player-child-1' }),
      membership({ role: 'player', team_id: U16.id, player_id: 'player-self-1' }),
    ]

    expect(childPlayerIds(memberships).sort()).toEqual(['player-child-1', 'player-self-1'])
  })

  it('deduplicates repeated player_ids', () => {
    const memberships = [
      membership({ role: 'parent', team_id: U8.id, player_id: 'player-child-1' }),
      membership({ role: 'parent', team_id: U12.id, player_id: 'player-child-1' }),
    ]

    expect(childPlayerIds(memberships)).toEqual(['player-child-1'])
  })

  it('ignores admin/coach rows and null player_ids', () => {
    const memberships = [
      membership({ role: 'admin', team_id: null, player_id: null }),
      membership({ role: 'coach', team_id: U12.id, player_id: null }),
    ]

    expect(childPlayerIds(memberships)).toEqual([])
  })

  it('returns an empty array for empty, null, or undefined memberships', () => {
    expect(childPlayerIds([])).toEqual([])
    expect(childPlayerIds(null)).toEqual([])
    expect(childPlayerIds(undefined)).toEqual([])
  })
})

// --- loadMyMemberships() (src/data/members.js) -----------------------------
//
// ⚠️ THIS COMMENT USED TO SAY "RLS already restricts rows to the caller, so
// this takes no user id argument." It was false, and these tests asserted the
// broken behaviour — `expect(select).toHaveBeenCalled()` passes whether or not
// the query is scoped to anybody.
//
// `memb read` is (profile_id = auth.uid() OR is_admin(club_id)). For an ADMIN
// the second clause matches EVERY ROW IN THE CLUB, so an unfiltered read
// returned the whole club as "my memberships" — and this provider's output is
// what every screen treats as the signed-in person's own access. Jay found it
// on 9 Aug 2026 by opening his own account page and seeing two other families'
// children under "Your players".
//
// The convention set by supabase.js/auth.jsx is throw-on-error, not
// {data, error} tuples — verified below.

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

import { supabase } from '../src/lib/supabase.js'
import { loadMyMemberships, listClubMembers, createInvite, acceptInvite } from '../src/data/members.js'

describe('loadMyMemberships', () => {
  // Mirrors the real builder: .select() returns something with .eq() on it.
  function builder(response) {
    const eq = vi.fn().mockResolvedValue(response)
    const select = vi.fn().mockReturnValue({ eq })
    supabase.from.mockReturnValue({ select })
    return { select, eq }
  }

  it('returns the rows from the memberships table joined to teams', async () => {
    const rows = [
      { id: 'm-1', role: 'coach', team_id: U12.id, player_id: null, teams: U12 },
    ]
    const { select } = builder({ data: rows, error: null })

    const result = await loadMyMemberships('user-1')

    expect(supabase.from).toHaveBeenCalledWith('memberships')
    expect(select).toHaveBeenCalled()
    expect(result).toEqual(rows)
  })

  // ⚠️ THE ASSERTION THE OLD TESTS DID NOT MAKE. Without it, an unscoped query
  // passes every other case in this block — which is exactly what happened.
  it('scopes the query to ONE profile, which RLS alone does not do', async () => {
    const { eq } = builder({ data: [], error: null })

    await loadMyMemberships('user-1')

    expect(eq).toHaveBeenCalledWith('profile_id', 'user-1')
  })

  // Thrown, not defaulted: a caller that forgets the id would otherwise get
  // the club-wide list back — silently, and only for admins, which is the
  // hardest possible shape of bug to notice.
  it('refuses to query at all without a profile id', async () => {
    // ⚠️ from.mockClear(), not a bare assertion: `supabase.from` is a module-
    // level mock shared with every other case in this file, so it carries
    // calls made by tests that ran before this one. Asserting on it without
    // clearing tests the order the file happens to run in.
    supabase.from.mockClear()

    await expect(loadMyMemberships()).rejects.toThrow(/needs a profileId/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns an empty array, never null, when there are no rows', async () => {
    builder({ data: null, error: null })

    const result = await loadMyMemberships('user-1')

    expect(result).toEqual([])
  })

  it('throws rather than swallowing a Supabase error', async () => {
    builder({ data: null, error: new Error('permission denied') })

    await expect(loadMyMemberships('user-1')).rejects.toThrow('permission denied')
  })
})

// --- listClubMembers() (src/data/members.js, Task 17) ----------------------
// Same throw-on-error / never-null convention as loadMyMemberships, but this
// query is club-wide, not scoped to the caller — see the function's own
// comment for why that is safe (RLS's `memb read` policy).

describe('listClubMembers', () => {
  it('returns every membership row, joined to the profile and team', async () => {
    const rows = [
      { id: 'm-1', role: 'coach', team_id: U12.id, player_id: null, profiles: { full_name: 'Jay Muir' }, teams: { name: U12.name } },
    ]
    const select = vi.fn().mockResolvedValue({ data: rows, error: null })
    supabase.from.mockReturnValue({ select })

    const result = await listClubMembers()

    expect(supabase.from).toHaveBeenCalledWith('memberships')
    expect(select).toHaveBeenCalled()
    expect(result).toEqual(rows)
  })

  it('returns an empty array, never null, when there are no rows', async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: null })
    supabase.from.mockReturnValue({ select })

    const result = await listClubMembers()

    expect(result).toEqual([])
  })

  it('throws rather than swallowing a Supabase error', async () => {
    const select = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('permission denied'),
    })
    supabase.from.mockReturnValue({ select })

    await expect(listClubMembers()).rejects.toThrow('permission denied')
  })
})

// --- createInvite() / acceptInvite() (src/data/members.js, Task 18) --------
// createInvite inserts a row into `invites` and asks for it back (same
// insert-then-select().maybeSingle() shape as upsertPlayer/upsertEvent in
// src/data/players.js and src/data/events.js), so a non-admin's insert being
// silently zero-rowed by RLS (the "invites manage" policy) is reported as a
// refusal rather than a false "sent". acceptInvite is a thin wrapper over the
// accept_invite RPC — the real validation (token exists, not already used,
// email matches) lives in the SECURITY DEFINER function itself, verified
// live; this module only has to throw the RPC's error rather than swallow it.

function createInsertBuilder({ data = null, error = null } = {}) {
  const calls = { insert: [] }
  const builder = {}
  builder.insert = vi.fn((...args) => {
    calls.insert.push(args)
    return builder
  })
  builder.select = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data, error }))
  return { builder, calls }
}

describe('createInvite', () => {
  it('inserts club_id, email, role, team_id, player_id and created_by, and reads the row back', async () => {
    const saved = {
      id: 'inv-1',
      club_id: 'club-1',
      email: 'coach@example.com',
      role: 'coach',
      team_id: U12.id,
      player_id: null,
      created_by: 'user-1',
      token: 'tok-abc',
      accepted_at: null,
    }
    const { builder, calls } = createInsertBuilder({ data: saved })
    supabase.from.mockReturnValue(builder)

    const result = await createInvite({
      clubId: 'club-1',
      email: 'coach@example.com',
      role: 'coach',
      teamId: U12.id,
      createdBy: 'user-1',
    })

    expect(supabase.from).toHaveBeenCalledWith('invites')
    expect(calls.insert[0][0]).toEqual({
      club_id: 'club-1',
      email: 'coach@example.com',
      role: 'coach',
      team_id: U12.id,
      player_id: null,
      created_by: 'user-1',
    })
    // The token is never generated client-side — the column default supplies
    // it, and it's read back from the inserted row.
    expect(calls.insert[0][0]).not.toHaveProperty('token')
    expect(builder.select).toHaveBeenCalled()
    expect(builder.maybeSingle).toHaveBeenCalled()
    expect(result).toEqual(saved)
  })

  it('passes team_id and player_id as null when omitted (an admin invite)', async () => {
    const { builder, calls } = createInsertBuilder({ data: { id: 'inv-2', token: 'tok' } })
    supabase.from.mockReturnValue(builder)

    await createInvite({ clubId: 'club-1', email: 'admin@example.com', role: 'admin', createdBy: 'user-1' })

    expect(calls.insert[0][0]).toMatchObject({ team_id: null, player_id: null })
  })

  it('passes a given player_id through (a parent invite linked to their child)', async () => {
    const { builder, calls } = createInsertBuilder({ data: { id: 'inv-3', token: 'tok' } })
    supabase.from.mockReturnValue(builder)

    await createInvite({
      clubId: 'club-1',
      email: 'parent@example.com',
      role: 'parent',
      teamId: U12.id,
      playerId: 'player-1',
      createdBy: 'user-1',
    })

    expect(calls.insert[0][0]).toMatchObject({ player_id: 'player-1' })
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createInsertBuilder({ error: new Error('duplicate key value') })
    supabase.from.mockReturnValue(builder)

    await expect(
      createInvite({ clubId: 'club-1', email: 'a@example.com', role: 'coach', teamId: U12.id, createdBy: 'u1' }),
    ).rejects.toThrow('duplicate key value')
  })

  it('throws a friendly message when the insert is silently refused by RLS (a non-admin)', async () => {
    const { builder } = createInsertBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(
      createInvite({ clubId: 'club-1', email: 'a@example.com', role: 'coach', teamId: U12.id, createdBy: 'u1' }),
    ).rejects.toThrow(/permission|not allowed|couldn.t (create|send)/i)
  })
})

describe('acceptInvite', () => {
  it('calls the accept_invite RPC with the token and returns the new membership row', async () => {
    const membershipRow = { id: 'm-new', role: 'coach', team_id: U12.id, profile_id: 'user-1' }
    supabase.rpc.mockResolvedValue({ data: membershipRow, error: null })

    const result = await acceptInvite('tok-abc')

    expect(supabase.rpc).toHaveBeenCalledWith('accept_invite', { _token: 'tok-abc' })
    expect(result).toEqual(membershipRow)
  })

  it('throws the RPC error rather than returning a tuple', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: new Error('This invite has already been used.'),
    })

    await expect(acceptInvite('tok-abc')).rejects.toThrow('This invite has already been used.')
  })
})

// Team Manager ('manager') and Medic ('medic'), added 5 Aug 2026. Both are
// IDENTICAL to 'coach' in what they may do — the distinction is documentary,
// so the club can record who fills which job.
describe('SQUAD_STAFF_ROLES', () => {
  // ⚠️ THE MIRROR TEST. This exact set is duplicated in
  // private.can_edit_team() in the database
  // (db/migrations/20260805_roles_manager_and_medic.sql). Nothing in
  // JavaScript can check the SQL, so this pins the JS side hard: changing it
  // fails here, and the failure message is the reminder that a migration has
  // to change too. The SQL is the real boundary — drift can hide a squad from
  // someone entitled to it, but can never let a write through that RLS refuses.
  it('is exactly coach, manager and medic', () => {
    expect(SQUAD_STAFF_ROLES).toEqual(['coach', 'manager', 'medic'])
  })

  it('recognises each of them, and nothing else', () => {
    expect(isSquadStaffRole('coach')).toBe(true)
    expect(isSquadStaffRole('manager')).toBe(true)
    expect(isSquadStaffRole('medic')).toBe(true)

    expect(isSquadStaffRole('admin')).toBe(false)
    expect(isSquadStaffRole('parent')).toBe(false)
    expect(isSquadStaffRole('player')).toBe(false)
    expect(isSquadStaffRole(undefined)).toBe(false)
    expect(isSquadStaffRole('')).toBe(false)
  })
})

describe('canEditTeam — manager and medic are exactly a coach', () => {
  // Parameterised on the set itself, so a role added to SQUAD_STAFF_ROLES
  // without the matching rights is caught here rather than in production.
  it.each(SQUAD_STAFF_ROLES)('lets a %s edit the squad they are attached to', (role) => {
    const memberships = [{ id: 'm1', role, team_id: 'team-u12' }]
    expect(canEditTeam(memberships, 'team-u12')).toBe(true)
  })

  it.each(SQUAD_STAFF_ROLES)('does NOT let a %s edit a squad they are not attached to', (role) => {
    const memberships = [{ id: 'm1', role, team_id: 'team-u12' }]
    expect(canEditTeam(memberships, 'team-u14')).toBe(false)
  })

  it.each(SQUAD_STAFF_ROLES)('still refuses a %s a null team, like the coach guard does', (role) => {
    const memberships = [{ id: 'm1', role, team_id: null }]
    expect(canEditTeam(memberships, null)).toBe(false)
  })

  it('leaves parents and players read-only, whatever else changed', () => {
    expect(canEditTeam([{ role: 'parent', team_id: 'team-u12', player_id: 'p1' }], 'team-u12')).toBe(false)
    expect(canEditTeam([{ role: 'player', team_id: 'team-u12', player_id: 'p1' }], 'team-u12')).toBe(false)
  })
})

describe('roleLabel — the new roles', () => {
  it('names a manager "Team Manager" and a medic "Medic"', () => {
    expect(roleLabel([{ role: 'manager', team_id: 'team-u12' }])).toBe('Team Manager')
    expect(roleLabel([{ role: 'medic', team_id: 'team-u12' }])).toBe('Medic')
  })

  // Jay's ruling 5 Aug: nobody is expected to hold both. The order is
  // therefore arbitrary, but it must be STABLE — an unstable one would make
  // the masthead label flicker between roles as rows load in any order.
  it('picks one label by precedence: admin > coach > manager > medic > parent > player', () => {
    const all = [
      { role: 'player', team_id: 't' },
      { role: 'parent', team_id: 't' },
      { role: 'medic', team_id: 't' },
      { role: 'manager', team_id: 't' },
      { role: 'coach', team_id: 't' },
      { role: 'admin', team_id: null },
    ]
    expect(roleLabel(all)).toBe('Admin')
    expect(roleLabel(all.slice(0, 5))).toBe('Coach')
    expect(roleLabel(all.slice(0, 4))).toBe('Team Manager')
    expect(roleLabel(all.slice(0, 3))).toBe('Medic')
    expect(roleLabel(all.slice(0, 2))).toBe('Parent')
  })

  it('does not treat a manager or medic as an admin', () => {
    expect(isAdmin([{ role: 'manager', team_id: 'team-u12' }])).toBe(false)
    expect(isAdmin([{ role: 'medic', team_id: 'team-u12' }])).toBe(false)
  })
})

describe('visibleTeams — the new roles see their own squad', () => {
  it.each(SQUAD_STAFF_ROLES)('gives a %s the squad on their membership row, and no other', (role) => {
    const teams = [
      { id: 'team-u12', name: 'U12', sort_order: 7 },
      { id: 'team-u14', name: 'U14', sort_order: 9 },
    ]
    const visible = visibleTeams([{ role, team_id: 'team-u12' }], teams)
    expect(visible.map((t) => t.name)).toEqual(['U12'])
  })
})
