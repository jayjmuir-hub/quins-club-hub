import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '../src/lib/supabase.js'
import {
  updateMyProfile,
  updateMemberProfile,
  updateProfileNames,
} from '../src/data/members.js'

// ══════════════════════════════════════════════════════════════════════════
//  A profiles WRITE must not read back phone/email — 29 Aug 2026.
//
//  20260828_profiles_contact_revoke.sql revoked SELECT on profiles.phone and
//  profiles.email from `authenticated`; those columns are now read only through
//  member_contacts. The read paths were rerouted, but three writers still ended
//  with a bare `.select()` — which PostgREST turns into `UPDATE … RETURNING *`,
//  a SELECT of every column INCLUDING phone. The result was
//  "permission denied for table profiles" the instant a parent saved their own
//  phone number (Jay, live, 29 Aug). Fix: read back only granted columns, and
//  re-attach the phone we just wrote so callers still get it.
//
//  This test captures the column list each writer asks for and fails if phone
//  or email ever creeps back into it — a bare `.select()` (undefined arg) fails
//  too, which is the exact regression.
// ══════════════════════════════════════════════════════════════════════════

function mockProfilesUpdate(returnedRow) {
  const captured = { selectArg: undefined, table: undefined }
  supabase.from.mockImplementation((table) => {
    captured.table = table
    return {
      update: () => ({
        eq: () => ({
          select: (cols) => {
            captured.selectArg = cols
            return { maybeSingle: () => Promise.resolve({ data: returnedRow, error: null }) }
          },
        }),
      }),
    }
  })
  return captured
}

const namesBackFromDb = {
  id: 'u1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  full_name: 'Ada Lovelace',
  name_confirmed_at: '2026-08-29T00:00:00Z',
}

beforeEach(() => supabase.from.mockReset())

describe('profiles writers never RETURNING * over the revoked contact columns', () => {
  it('updateMyProfile reads back only granted columns and re-attaches the phone it wrote', async () => {
    const captured = mockProfilesUpdate(namesBackFromDb)
    const row = await updateMyProfile({
      profileId: 'u1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+971500000000',
    })

    expect(captured.selectArg).toBeTruthy() // not a bare `.select()`
    expect(captured.selectArg).not.toMatch(/phone|email/)
    // The DB row carries no phone; the writer re-attaches what it saved.
    expect(row.phone).toBe('+971500000000')
    expect(row.full_name).toBe('Ada Lovelace')
  })

  it('updateMyProfile re-attaches null when the phone was cleared', async () => {
    mockProfilesUpdate(namesBackFromDb)
    const row = await updateMyProfile({ profileId: 'u1', firstName: 'Ada', phone: '' })
    expect(row.phone).toBeNull()
  })

  it('updateMemberProfile (admin path) reads back only granted columns and re-attaches the phone', async () => {
    const captured = mockProfilesUpdate({
      id: 'u2',
      first_name: 'Grace',
      last_name: 'Hopper',
      full_name: 'Grace Hopper',
    })
    const row = await updateMemberProfile({
      profileId: 'u2',
      firstName: 'Grace',
      lastName: 'Hopper',
      phone: '+971500000001',
    })

    expect(captured.selectArg).toBeTruthy()
    expect(captured.selectArg).not.toMatch(/phone|email/)
    expect(row.phone).toBe('+971500000001')
    expect(row.full_name).toBe('Grace Hopper')
  })

  it('updateProfileNames (name-confirm path) reads back only granted columns', async () => {
    const captured = mockProfilesUpdate(namesBackFromDb)
    const row = await updateProfileNames({ profileId: 'u1', firstName: 'Ada', lastName: 'Lovelace' })

    expect(captured.selectArg).toBeTruthy()
    expect(captured.selectArg).not.toMatch(/phone|email/)
    expect(row.full_name).toBe('Ada Lovelace')
  })
})
