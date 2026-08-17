import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'

// /admin/rights-log — who gave whom access, and when.
//
// Jay, 17 Aug 2026: "we need a change log for changes to rights", then "the log
// should only be visible by super admins".
//
// ⚠️ THE TRIGGER SHIPPED A DAY BEFORE ANYTHING COULD READ IT, so the tests here
// are about the READING half: does an entry say what actually happened, is an
// elevation findable without reading every line, and does a non-super get an
// explanation rather than an empty screen.
//
// ⚠️ NONE OF THIS IS THE SECURITY. `membership_audit`'s only policy is
// `private.is_super_admin()`, proved against production in that migration, and
// an ordinary admin's select returns zero rows whatever this file asserts. What
// is tested here is that the screen does not MISREPRESENT what it was given.

const listMembershipAuditMock = vi.fn()
const listAuditProfilesMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/audit.js', () => ({
  listMembershipAudit: (...args) => listMembershipAuditMock(...args),
  listAuditProfiles: (...args) => listAuditProfilesMock(...args),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

import AdminRightsLog from '../src/screens/AdminRightsLog.jsx'
import {
  GONE,
  actorName,
  auditDetails,
  auditHeadline,
  isElevation,
  subjectName,
} from '../src/lib/auditFormat.js'

const TEAMS = [{ id: 'team-u16', name: 'U16B', sort_order: 8 }]

// ⚠️ INVENTED NAMES. This repo is public and its members are mostly children —
// CLAUDE.md, and a worked example is still writing a name down.
const PROFILES = [
  { id: 'p-subject', full_name: 'Robin Oyelaran-Whyte', email: 'robin@example.com' },
  { id: 'p-actor', full_name: 'Kit Amankwah', email: 'kit@example.com' },
  { id: 'p-nameless', full_name: null, email: 'nameless@example.com' },
]

function memberships(rows) {
  return {
    memberships: rows,
    realMemberships: rows,
    teams: TEAMS,
    viewAs: null,
    setViewAs: vi.fn(),
    loading: false,
    error: null,
    reload: vi.fn(),
  }
}

function admin(extra = {}) {
  return [{ id: 'm1', role: 'admin', status: 'active', team_id: null, admin_rights: [], ...extra }]
}

const superAdmin = () => memberships(admin({ is_super: true }))
const ordinaryAdmin = () => memberships(admin())

function entry(over = {}) {
  return {
    id: 1,
    at: '2026-08-17T09:30:00.000Z',
    membership_id: 'mem-1',
    profile_id: 'p-subject',
    club_id: 'club-1',
    team_id: 'team-u16',
    player_id: null,
    action: 'changed',
    actor_id: 'p-actor',
    actor_kind: 'member',
    old_role: 'coach',
    new_role: 'coach',
    old_status: 'pending',
    new_status: 'active',
    old_is_super: false,
    new_is_super: false,
    old_rights: [],
    new_rights: [],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  listAuditProfilesMock.mockResolvedValue(PROFILES)
  useMembershipsMock.mockReturnValue(superAdmin())
})

describe('auditFormat — saying what happened, not that something did', () => {
  it('⚠️ calls a pending grant a REQUEST, not access', () => {
    // Almost every row starts life pending: request_staff_role, the roll-call
    // and claim_roster_access all insert `pending`. "Given Coach" on a request
    // nobody approved describes a hole that does not exist, on the screen
    // somebody opens when they suspect one does.
    const asked = entry({ action: 'granted', new_status: 'pending', new_role: 'coach' })
    expect(auditHeadline(asked)).toBe('Asked for Coach')

    const given = entry({ action: 'granted', new_status: 'active', new_role: 'coach' })
    expect(auditHeadline(given)).toBe('Given Coach')
  })

  it('names the approval rather than reciting the status columns', () => {
    expect(auditDetails(entry())).toEqual(['Approved'])
  })

  it('says a super admin was made, in words', () => {
    const row = entry({ old_is_super: false, new_is_super: true, old_status: 'active' })
    expect(auditDetails(row)).toContain('Made a super admin')
  })

  it('spells the jobs out with their real labels, both sides of the change', () => {
    const row = entry({
      old_status: 'active',
      old_rights: [],
      new_rights: ['pitches', 'youth'],
    })
    expect(auditDetails(row)).toContain('Jobs: none → Pitch Management, Club Youth Manager')
  })

  it('⚠️ ignores a re-ordering of the same jobs — that is not a change', () => {
    const row = entry({
      old_status: 'active',
      old_rights: ['youth', 'pitches'],
      new_rights: ['pitches', 'youth'],
    })
    expect(auditDetails(row)).toEqual([])
  })

  it('⚠️ says "the system" for a write with no signed-in user, never a blank', () => {
    // NULL actor is not "nobody did it" — a cron job, a service-role write or a
    // migration has no session, and the trigger records `system` on purpose. An
    // unexplained gap in an audit log is indistinguishable from a lost one.
    const row = entry({ actor_id: null, actor_kind: 'system' })
    expect(actorName(row, new Map())).toBe('the system')
  })

  it('⚠️ says an account is gone rather than rendering nothing', () => {
    // The audit deliberately has no foreign keys, so it outlives the profile.
    // A blank reads as a broken screen; this is the log working as designed.
    const row = entry({ profile_id: 'p-deleted' })
    expect(subjectName(row, new Map())).toBe(GONE)
  })

  describe('isElevation — the entries worth noticing', () => {
    it('counts an approved staff claim, which is how somebody reaches children', () => {
      expect(isElevation(entry())).toBe(true)
    })

    it('counts becoming a super admin', () => {
      const row = entry({ old_status: 'active', old_is_super: false, new_is_super: true })
      expect(isElevation(row)).toBe(true)
    })

    it('⚠️ does NOT count a pending request, which grants nothing', () => {
      const row = entry({ action: 'granted', new_status: 'pending', new_role: 'coach' })
      expect(isElevation(row)).toBe(false)
    })

    it('does not count a revoke, which is the opposite direction', () => {
      const row = entry({ action: 'revoked', new_role: null, new_status: null })
      expect(isElevation(row)).toBe(false)
    })
  })
})

describe('AdminRightsLog', () => {
  it('⚠️ tells an ordinary admin why, and reads nothing at all', async () => {
    useMembershipsMock.mockReturnValue(ordinaryAdmin())
    render(<AdminRightsLog />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/super admins only/i)
    // ⚠️ THE SECOND HALF IS THE POINT. A screen that renders the refusal AFTER
    // issuing the query has still asked the database for an audit log on behalf
    // of somebody who may not read it. RLS would refuse it — but a request that
    // relies on being refused is one nobody notices when the policy changes.
    expect(listMembershipAuditMock).not.toHaveBeenCalled()
  })

  it('shows who did it, to whom, and when', async () => {
    listMembershipAuditMock.mockResolvedValue([entry()])
    render(<AdminRightsLog />)

    const row = await screen.findByTestId('audit-entry')
    expect(within(row).getByText(/Approved/)).toBeInTheDocument()
    expect(within(row).getByText('Robin Oyelaran-Whyte')).toBeInTheDocument()
    expect(within(row).getByText(/by Kit Amankwah/)).toBeInTheDocument()
    expect(within(row).getByText(/U16B/)).toBeInTheDocument()
  })

  it('⚠️ counts the elevations, not the entries', async () => {
    // "3 changes" says a log exists. "1 of them handed somebody access" is what
    // a super admin opened the screen to find, and is the number that should
    // look wrong when it is wrong.
    listMembershipAuditMock.mockResolvedValue([
      entry(),
      entry({ id: 2, action: 'granted', new_status: 'pending', new_role: 'coach' }),
      entry({ id: 3, action: 'revoked', new_role: null, new_status: null }),
    ])
    render(<AdminRightsLog />)

    expect(await screen.findByTestId('audit-summary')).toHaveTextContent(
      '3 changes, 1 of which handed somebody access.',
    )
  })

  it('marks the elevated row so it can be found without reading every line', async () => {
    listMembershipAuditMock.mockResolvedValue([
      entry({ id: 2, action: 'granted', new_status: 'pending', new_role: 'coach' }),
      entry(),
    ])
    render(<AdminRightsLog />)

    await screen.findAllByTestId('audit-entry')
    const marks = screen.getAllByTestId('audit-entry').map((el) => el.dataset.elevation)
    expect(marks).toEqual(['no', 'yes'])
  })

  it('falls back to the email for somebody who never confirmed a name', async () => {
    // A safeguarding log must identify a person even when the profile is bare.
    listMembershipAuditMock.mockResolvedValue([entry({ profile_id: 'p-nameless' })])
    render(<AdminRightsLog />)

    expect(await screen.findByText('nameless@example.com')).toBeInTheDocument()
  })

  it('⚠️ says when recording started, rather than implying nothing has happened', async () => {
    listMembershipAuditMock.mockResolvedValue([])
    render(<AdminRightsLog />)

    expect(await screen.findByText(/since this log started on 17 August 2026/i)).toBeInTheDocument()
  })

  it('⚠️ admits it is a window when it is full, rather than reading as the whole history', async () => {
    listMembershipAuditMock.mockResolvedValue(
      Array.from({ length: 200 }, (_, i) => entry({ id: i + 1 })),
    )
    render(<AdminRightsLog />)

    expect(await screen.findByTestId('audit-truncated')).toHaveTextContent(/most recent 200/i)
  })

  it('does not claim to be a window when it is not full', async () => {
    listMembershipAuditMock.mockResolvedValue([entry()])
    render(<AdminRightsLog />)

    await screen.findByTestId('audit-entry')
    expect(screen.queryByTestId('audit-truncated')).not.toBeInTheDocument()
  })

  it('reports a failed read instead of showing an empty log', async () => {
    // ⚠️ THE DISCRIMINATING CASE. "Nothing recorded yet" and "the read failed"
    // look identical on an audit screen and mean opposite things — one says
    // nobody has changed anyone's access, the other says you cannot see whether
    // they have.
    listMembershipAuditMock.mockRejectedValue(new Error('network down'))
    render(<AdminRightsLog />)

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
    await waitFor(() => {
      expect(screen.queryByText(/Nothing recorded yet/i)).not.toBeInTheDocument()
    })
  })
})
