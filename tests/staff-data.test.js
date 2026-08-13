import { describe, it, expect, vi, beforeEach } from 'vitest'

// The data layer behind /admin/staff. Two rules are worth a test each, and both
// are rules this repo has already been bitten by in another file.

const maybeSingleMock = vi.fn()
const updatePayloadSpy = vi.fn()

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (payload) => {
        updatePayloadSpy(payload)
        return { eq: () => ({ select: () => ({ maybeSingle: maybeSingleMock }) }) }
      },
    }),
  },
}))

import { setMembershipTitle, toStaffMember } from '../src/data/staff.js'
import { labelForRole, STAFF_TITLES } from '../src/lib/scope.js'

beforeEach(() => {
  vi.clearAllMocks()
  maybeSingleMock.mockResolvedValue({ data: { id: 'm1', title: null }, error: null })
})

// ⚠️ THE FALLBACK MUST CATCH BLANK, NOT ONLY NULL. `full_name ?? 'x'` looks
// right and lets an empty string through, producing a nameless row that reads
// as a rendering bug — shipped and fixed at two sites on 13 Aug 2026 (02e9a05).
// src/data/members.js refuses to WRITE a blank name for the same reason; this
// is the read side of that rule and it needs its own test because the write
// guard does not protect rows created before it existed.
describe('toStaffMember — the nameless row', () => {
  it('uses the name when there is one', () => {
    const row = { id: 'm1', role: 'coach', title: 'Head Coach', profiles: { full_name: 'Alex Morgan', email: 'a@example.com', phone: '+9715' } }
    expect(toStaffMember(row).name).toBe('Alex Morgan')
  })

  it('falls back to the email when full_name is NULL', () => {
    const row = { id: 'm1', role: 'coach', profiles: { full_name: null, email: 'a@example.com' } }
    expect(toStaffMember(row).name).toBe('a@example.com')
  })

  it('falls back to the email when full_name is an EMPTY STRING', () => {
    const row = { id: 'm1', role: 'coach', profiles: { full_name: '', email: 'a@example.com' } }
    expect(toStaffMember(row).name).toBe('a@example.com')
  })

  it('falls back to the email when full_name is only whitespace', () => {
    const row = { id: 'm1', role: 'coach', profiles: { full_name: '   ', email: 'a@example.com' } }
    expect(toStaffMember(row).name).toBe('a@example.com')
  })

  it('has a last resort when there is neither', () => {
    const row = { id: 'm1', role: 'coach', profiles: { full_name: '', email: '' } }
    expect(toStaffMember(row).name).toBe('No name yet')
  })

  it('reports a missing phone and a missing title as null, never as an empty string', () => {
    const row = { id: 'm1', role: 'medic', title: '  ', profiles: { full_name: 'Sam', email: 's@example.com', phone: '' } }
    const member = toStaffMember(row)
    expect(member.phone).toBeNull()
    expect(member.title).toBeNull()
  })
})

// ⚠️ TWO VALUES MEANING "no title" is how a screen ends up with an empty chip
// nobody can clear. The write normalises to NULL, matching what the read
// expects.
describe('setMembershipTitle', () => {
  it('writes NULL when the title is cleared', async () => {
    await setMembershipTitle({ membershipId: 'm1', title: '   ' })
    expect(updatePayloadSpy).toHaveBeenCalledWith({ title: null })
  })

  it('trims what it writes', async () => {
    await setMembershipTitle({ membershipId: 'm1', title: '  Head Coach  ' })
    expect(updatePayloadSpy).toHaveBeenCalledWith({ title: 'Head Coach' })
  })

  // ⚠️ RLS filters a refused row OUT rather than erroring, so PostgREST answers
  // with a perfectly successful empty result. Treating that as success is how a
  // save the database rejected looks like one that worked.
  it('treats no returned row as a refusal', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    await expect(setMembershipTitle({ membershipId: 'm1', title: 'Head Coach' })).rejects.toThrow(
      /permission/i,
    )
  })

  it('refuses to run without a membership id', async () => {
    await expect(setMembershipTitle({ title: 'Head Coach' })).rejects.toThrow(/membershipId/)
  })
})

describe('labelForRole', () => {
  it('labels one role rather than the highest of a set', () => {
    expect(labelForRole('coach')).toBe('Coach')
    expect(labelForRole('manager')).toBe('Team Manager')
    expect(labelForRole('medic')).toBe('Medic')
  })

  // ⚠️ Null rather than a guess: a role added to the database and not to
  // scope.js should render as nothing, never as a wrong label.
  it('returns null for a role it does not know', () => {
    expect(labelForRole('physio')).toBeNull()
    expect(labelForRole(undefined)).toBeNull()
  })
})

describe('STAFF_TITLES', () => {
  // The vocabulary is suggestions only — the column has no check constraint,
  // deliberately, so that a new job title never needs a migration.
  it('offers the titles the club asked for', () => {
    expect(STAFF_TITLES).toContain('Head Coach')
    expect(STAFF_TITLES).toContain('Assistant Coach')
  })
})
