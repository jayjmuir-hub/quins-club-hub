import { describe, it, expect, vi, beforeEach } from 'vitest'

// Data layer for profile icons (claude/plans/2026-08-31-profile-icons.md).
// The supabase client is mocked; this proves the SHAPE of each call. Who may
// grant is the database's (db/tests/profile-icons.sql).

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

import { supabase } from '../src/lib/supabase.js'
import {
  listClubIconMap,
  listMemberIcons,
  listIconGrants,
  grantIcon,
  revokeIcon,
  setPrimaryIcon,
} from '../src/data/profileIcons.js'

function builder(result) {
  const calls = {}
  const b = {}
  for (const name of ['select', 'eq', 'insert', 'update', 'delete', 'single']) {
    b[name] = vi.fn((...args) => {
      ;(calls[name] ??= []).push(args)
      return b
    })
  }
  b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return { b, calls }
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.rpc.mockReset()
})

describe('the icon read paths', () => {
  it('listClubIconMap turns the RPC rows into a Map', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        { profile_id: 'p-1', icon: 'crown' },
        { profile_id: 'p-2', icon: 'star' },
      ],
      error: null,
    })
    const map = await listClubIconMap()
    expect(supabase.rpc).toHaveBeenCalledWith('club_icon_map')
    expect(map.get('p-1')).toBe('crown')
    expect(map.size).toBe(2)
  })

  it('listMemberIcons asks for one person', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await listMemberIcons('p-9')
    expect(supabase.rpc).toHaveBeenCalledWith('member_icons', { _profile: 'p-9' })
  })
})

describe('the admin grant list', () => {
  it('reads every grant with the target names embedded, newest first', async () => {
    const sel = builder({ data: [], error: null })
    supabase.from.mockReturnValue(sel.b)
    sel.b.order = vi.fn(() => sel.b)
    await listIconGrants()
    expect(supabase.from).toHaveBeenCalledWith('profile_icons')
    // The COLUMN-disambiguated embed — two FKs point at profiles, and a bare
    // profiles(full_name) is a PGRST201 in production.
    expect(sel.calls.select[0][0]).toMatch(/profiles!profile_id\(full_name\)/)
    expect(sel.calls.select[0][0]).toMatch(/teams\(name\)/)
  })
})

describe('the grant writes', () => {
  it('a squad grant inserts team_id and never profile_id — the db refuses both', async () => {
    const ins = builder({ data: null, error: null })
    supabase.from.mockReturnValue(ins.b)
    await grantIcon({ clubId: 'c-1', teamId: 't-1', icon: 'crown', reason: 'Best age group' })
    expect(supabase.from).toHaveBeenCalledWith('profile_icons')
    expect(ins.calls.insert[0][0]).toEqual({
      club_id: 'c-1',
      team_id: 't-1',
      icon: 'crown',
      reason: 'Best age group',
    })
  })

  it('a person grant inserts profile_id, and a blank reason stays absent', async () => {
    const ins = builder({ data: null, error: null })
    supabase.from.mockReturnValue(ins.b)
    await grantIcon({ clubId: 'c-1', profileId: 'p-1', icon: 'star', reason: '  ' })
    expect(ins.calls.insert[0][0]).toEqual({ club_id: 'c-1', profile_id: 'p-1', icon: 'star' })
  })

  it('a role grant sends role and no team or person (4 Sep 2026)', async () => {
    const ins = builder({ data: null, error: null })
    supabase.from.mockReturnValue(ins.b)
    await grantIcon({ clubId: 'c-1', role: 'manager', icon: 'clipboard' })
    expect(ins.calls.insert[0][0]).toEqual({ club_id: 'c-1', role: 'manager', icon: 'clipboard' })
  })

  it('revoke deletes by id; primary updates by id', async () => {
    const del = builder({ data: null, error: null })
    supabase.from.mockReturnValue(del.b)
    await revokeIcon('g-1')
    expect(del.calls.delete).toHaveLength(1)
    expect(del.calls.eq[0]).toEqual(['id', 'g-1'])

    const upd = builder({ data: null, error: null })
    supabase.from.mockReturnValue(upd.b)
    await setPrimaryIcon('g-2')
    expect(upd.calls.update[0][0]).toEqual({ is_primary: true })
    expect(upd.calls.eq[0]).toEqual(['id', 'g-2'])
  })
})
