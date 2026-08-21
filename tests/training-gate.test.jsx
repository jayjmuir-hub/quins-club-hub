import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The wrapper the three Rugby Performance Director screens put themselves in.
//
// ⚠️ THIS IS A MESSAGE, NEVER A BOUNDARY, and the tests below are written so
// that nobody can mistake it for one. Every training table's RLS keys off
// private.is_admin / private.can_edit_team; the right decides which specialist
// dashboard is OFFERED, and withholds no row from anybody. The same sentence is
// at the top of src/lib/scope.js and it is the one to re-read before adding a
// fifth right.
//
// ⚠️ EACH ASSERTION WAS PROVED AGAINST AN INJECTED FAULT (rule 6): with the
// `hasAdminRight` line returning true unconditionally the refusal tests fail,
// and with it returning false the pass-through test fails.

const useMembershipsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// Imported after vi.mock so it binds to the mocked module.
import TrainingGate from '../src/screens/TrainingGate.jsx'

/** ⚠️ `status: 'active'` is load-bearing — adminRights() skips anything else. */
function admin(rights = [], extra = {}) {
  return [{ id: 'm1', role: 'admin', status: 'active', team_id: null, admin_rights: rights, ...extra }]
}

function mount(rows) {
  useMembershipsMock.mockReturnValue({ memberships: rows })
  return render(
    <TrainingGate>
      <div>Session library</div>
    </TrainingGate>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TrainingGate', () => {
  it('renders the screen for an admin holding the training right', () => {
    mount(admin(['training']))
    expect(screen.getByText('Session library')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ⚠️ A super admin holds every right implicitly, so the gate must not ask
  // for `training` to be listed. Getting this wrong locks out the one account
  // that hands the right out in the first place.
  it('renders the screen for a super admin who was never given the right', () => {
    mount(admin([], { is_super: true }))
    expect(screen.getByText('Session library')).toBeInTheDocument()
  })

  it('⚠️ refuses an admin without it, naming the job and the fix', () => {
    mount(admin(['youth']))
    expect(screen.queryByText('Session library')).not.toBeInTheDocument()

    const card = screen.getByRole('alert')
    // The label has ONE home (src/lib/scope.js) and this is the wording Jay
    // chose on 20 Aug 2026 — person-shaped where the other three are not.
    expect(card).toHaveTextContent('Rugby Performance Director')
    // ⚠️ THE SAME SENTENCE THE OTHER THREE REFUSALS USE. "hasn't been added to
    // your account" is the jobs-not-people prose, not a stylistic choice:
    // claude/decisions/2026-08-12-jobs-not-people.md.
    expect(card).toHaveTextContent(/hasn’t been added to your account/i)
    expect(card).toHaveTextContent(/super admin can add it on the Accounts screen/i)
  })

  it('refuses a coach, who is not an admin at all', () => {
    mount([{ id: 'm2', role: 'coach', status: 'active', team_id: 'team-u10' }])
    expect(screen.queryByText('Session library')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  // ⚠️ THE CONTROL. A membership that is not yet approved must not carry a
  // right — the same rule adminRights() enforces, asserted here because this is
  // the component people will read when they wonder what the gate does.
  it('refuses a PENDING admin who was listed with the right', () => {
    mount([
      { id: 'm3', role: 'admin', status: 'pending', team_id: null, admin_rights: ['training'] },
    ])
    expect(screen.queryByText('Session library')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
