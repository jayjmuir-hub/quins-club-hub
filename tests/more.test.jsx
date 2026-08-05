import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Unit tests for src/screens/More.jsx (admin-dashboard plan, 2026-08-05).
// useMemberships is mocked so this exercises only the screen's own
// rendering. No network is reachable from this file — and that is itself
// part of the contract: More makes no query at all, everything it shows is
// already in the membership provider.
//
// This file replaces tests/admin.test.jsx. /more used to render the
// admin-only Admin overview, so three of the four roles got a "not
// authorised" card on their own tab; the whole point of the rewrite is that
// /more is now for everyone.

const useMembershipsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// Import after vi.mock so this binds to the mocked module.
import More from '../src/screens/More.jsx'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_FIRST_XV = { id: 'team-1xv', name: 'Senior Men 1st XV', sort_order: 13 }
const TEAMS = [TEAM_FIRST_XV, TEAM_U10] // deliberately unsorted; visibleTeams sorts

const ADMIN = [{ id: 'm1', role: 'admin', team_id: null }]
const COACH = [{ id: 'm2', role: 'coach', team_id: 'team-u10' }]
const PARENT = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }]

function memberships(rows, teams = TEAMS) {
  return { memberships: rows, teams, loading: false, error: null, reload: vi.fn() }
}

function renderMore() {
  return render(
    <MemoryRouter initialEntries={['/more']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <More />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue(memberships(ADMIN))
})

describe('More — for every role', () => {
  it('renders a real More screen for a parent, not a not-authorised card', () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    renderMore()

    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/not authorised/i)).not.toBeInTheDocument()
  })

  it('renders a real More screen for a coach, not a not-authorised card', () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    renderMore()

    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByText(/not authorised/i)).not.toBeInTheDocument()
  })

  it('shows the role label and the squads the person can see', () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    renderMore()

    expect(screen.getByTestId('your-role')).toHaveTextContent('Parent')
    expect(screen.getByTestId('your-squads')).toHaveTextContent('U10')
    // A parent of a U10 player must not be told they can see the 1st XV.
    expect(screen.getByTestId('your-squads')).not.toHaveTextContent('Senior Men 1st XV')
  })

  it('shows every squad for an admin, in sort order', () => {
    renderMore()

    expect(screen.getByTestId('your-role')).toHaveTextContent('Admin')
    expect(screen.getByTestId('your-squads')).toHaveTextContent('U10 · Senior Men 1st XV')
  })

  it('says so plainly when the person can see no squads yet', () => {
    useMembershipsMock.mockReturnValue(memberships(COACH, []))

    renderMore()

    expect(screen.getByTestId('your-squads')).toHaveTextContent(/no squads yet/i)
  })
})

describe('More — the Admin link', () => {
  it('offers an Admin link to an admin, pointing at /admin', () => {
    renderMore()

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
  })

  it('does not offer an Admin link to a coach', () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    renderMore()

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('does not offer an Admin link to a parent', () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    renderMore()

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })
})

describe('More — what it deliberately does NOT do', () => {
  // The duplication this plan exists to remove: /more used to list every
  // club member read-only while /accounts listed the same rows with write
  // controls. The Accounts tab is now the only place club members appear.
  it('does not list club members', () => {
    renderMore()

    expect(screen.queryAllByTestId('member-row')).toHaveLength(0)
    expect(screen.queryByText(/club members/i)).not.toBeInTheDocument()
  })

  // ⚠️ Sign-out is rendered by AppShell on this route, not by this screen.
  // If it ever moves in here, the guard in tests/app.test.jsx (a parent
  // signing out through the real App) is what keeps it working; this only
  // pins the current division of labour.
  it('does not render its own sign-out control', () => {
    renderMore()

    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })
})
