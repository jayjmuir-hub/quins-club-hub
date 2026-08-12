import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// The admin portal split — /admin is a chooser, each job is its own space.
// claude/decisions/2026-08-12-admin-portals.md
//
// ⚠️ EVERY ASSERTION HERE WAS PROVED AGAINST AN INJECTED FAULT before it was
// trusted (rule 6). The ones worth naming, because they are the ones a
// plausible "tidy-up" would break:
//   - Pitch Management links to ALLOCATION, not to the setup screen.
//   - A grey card is not a link IN THE MARKUP, so it cannot be tabbed to or
//     pressed. Styling it grey and leaving it a <Link> passes a screenshot and
//     fails a person.
//   - Social Media Management is grey for a SUPER admin, who implicitly holds
//     every right — because the reason is "no screen", not "no right".

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

// Import after vi.mock so these bind to the mocked modules.
import AdminDashboard from '../src/screens/AdminDashboard.jsx'
import PortalChooser from '../src/screens/PortalChooser.jsx'
import { PORTALS, closedReason, portalForPath, portalHome, portalLabel } from '../src/lib/portals.js'

const TEAMS = [{ id: 'team-u10', name: 'U10', sort_order: 5 }]

/** ⚠️ `status: 'active'` is load-bearing — adminRights() skips anything else. */
function admin(rights = [], extra = {}) {
  return [{ id: 'm1', role: 'admin', status: 'active', team_id: null, admin_rights: rights, ...extra }]
}

function memberships(rows) {
  return { memberships: rows, teams: TEAMS, loading: false, error: null, reload: vi.fn() }
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/admin" element={<AdminDashboard />}>
          <Route index element={<PortalChooser />} />
          <Route path="accounts" element={<div>Accounts marker</div>} />
          <Route path="club" element={<div>Club marker</div>} />
          <Route path="allocation" element={<div>Allocation marker</div>} />
          <Route path="pitches" element={<div>Pitches marker</div>} />
          <Route path="youth" element={<div>Match sheets marker</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ user: { id: 'admin-1', email: 'jay@example.com' } })
})

describe('portals.js', () => {
  it('labels the three jobs from scope.js, so the naming ruling has one home', () => {
    const byKey = Object.fromEntries(PORTALS.map((p) => [p.key, portalLabel(p)]))
    expect(byKey).toEqual({
      club: 'Club Admin',
      pitches: 'Pitch Management',
      youth: 'Club Youth Manager',
      media: 'Social Media Management',
    })
  })

  it('⚠️ enters Pitch Management at ALLOCATION, the weekly job — not the setup screen', () => {
    const pitches = PORTALS.find((p) => p.key === 'pitches')
    expect(portalHome(pitches)).toBe('/admin/allocation')
  })

  it('maps every tab URL back to its own portal, and bare /admin to none', () => {
    expect(portalForPath('/admin')).toBeNull()
    expect(portalForPath('/admin/accounts').key).toBe('club')
    expect(portalForPath('/admin/club').key).toBe('club')
    expect(portalForPath('/admin/allocation').key).toBe('pitches')
    expect(portalForPath('/admin/pitches').key).toBe('pitches')
    expect(portalForPath('/admin/youth').key).toBe('youth')
  })

  it('⚠️ closes a portal with no screens even for somebody holding the right', () => {
    const media = PORTALS.find((p) => p.key === 'media')
    expect(closedReason(media, admin(['media']))).toBe('no-screen')
    // And a super admin, who holds every right implicitly.
    expect(closedReason(media, admin([], { is_super: true }))).toBe('no-screen')
  })

  it('distinguishes "no right" from "no screen" — different problems, different fixes', () => {
    const pitches = PORTALS.find((p) => p.key === 'pitches')
    expect(closedReason(pitches, admin([]))).toBe('no-right')
    expect(closedReason(pitches, admin(['pitches']))).toBeNull()
  })
})

describe('PortalChooser', () => {
  it('renders ALL four cards for an admin with no extra rights, only one of them a link', () => {
    useMembershipsMock.mockReturnValue(memberships(admin([])))
    renderAt('/admin')

    expect(screen.getAllByTestId(/^portal-card-/)).toHaveLength(4)
    const open = screen.getAllByTestId('portal-card-open')
    expect(open).toHaveLength(1)
    expect(open[0]).toHaveAttribute('href', '/admin/accounts')
    expect(within(open[0]).getByRole('heading')).toHaveTextContent('Club Admin')
  })

  it('⚠️ a grey card is NOT a link and cannot be focused', () => {
    useMembershipsMock.mockReturnValue(memberships(admin([])))
    renderAt('/admin')

    for (const card of screen.getAllByTestId('portal-card-closed')) {
      expect(card.tagName).not.toBe('A')
      expect(card).not.toHaveAttribute('href')
      expect(card.querySelector('a')).toBeNull()
      expect(card.querySelector('button')).toBeNull()
    }
  })

  it('opens Pitch Management for a holder, pointing at Allocation', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['pitches'])))
    renderAt('/admin')

    const open = screen.getAllByTestId('portal-card-open')
    expect(open.map((el) => el.getAttribute('href'))).toEqual(['/admin/accounts', '/admin/allocation'])
  })

  it('⚠️ leaves Social Media Management grey for a SUPER admin, and says why', () => {
    useMembershipsMock.mockReturnValue(memberships(admin([], { is_super: true })))
    renderAt('/admin')

    // A super holds every right, so three portals open and only the screenless
    // one stays shut.
    expect(screen.getAllByTestId('portal-card-open')).toHaveLength(3)
    const closed = screen.getAllByTestId('portal-card-closed')
    expect(closed).toHaveLength(1)
    expect(closed[0]).toHaveAttribute('data-reason', 'no-screen')
    expect(closed[0]).toHaveTextContent('Social Media Management')
    expect(closed[0]).toHaveTextContent(/no screen yet/i)
  })

  it('tells somebody without the job how to get it, which is a different message', () => {
    useMembershipsMock.mockReturnValue(memberships(admin([])))
    renderAt('/admin')

    const pitchCard = screen
      .getAllByTestId('portal-card-closed')
      .find((el) => el.textContent.includes('Pitch Management'))
    expect(pitchCard).toHaveAttribute('data-reason', 'no-right')
    expect(pitchCard).toHaveTextContent(/super admin can add it on the Accounts screen/i)
  })

  it('shows no tab row on the chooser itself', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['pitches', 'youth'])))
    renderAt('/admin')

    expect(screen.queryByRole('navigation', { name: /admin sections/i })).not.toBeInTheDocument()
  })
})

describe('AdminDashboard — inside a portal', () => {
  it('shows only that portal’s tabs, not every tab the person is entitled to', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['pitches', 'youth'])))
    renderAt('/admin/allocation')

    const tabs = screen.getByRole('navigation', { name: /admin sections/i })
    expect(within(tabs).getAllByRole('link').map((el) => el.textContent)).toEqual([
      'Allocation',
      'Pitches',
    ])
    // The old single row would have carried these too.
    expect(within(tabs).queryByText('Accounts')).not.toBeInTheDocument()
    expect(within(tabs).queryByText('Match sheets')).not.toBeInTheDocument()
  })

  it('titles the screen with the portal and offers a way back', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['pitches'])))
    renderAt('/admin/allocation')

    expect(screen.getByRole('heading', { name: 'Pitch Management' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Admin/ })).toHaveAttribute('href', '/admin')
  })

  it('⚠️ draws NO tab row for a one-tab portal', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['youth'])))
    renderAt('/admin/youth')

    expect(screen.getByRole('heading', { name: 'Club Youth Manager' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /admin sections/i })).not.toBeInTheDocument()
  })

  it('still refuses a non-admin, unchanged', () => {
    useMembershipsMock.mockReturnValue(memberships([{ id: 'm2', role: 'coach', status: 'active', team_id: 'team-u10' }]))
    renderAt('/admin')

    expect(screen.getByText('Not authorised')).toBeInTheDocument()
    expect(screen.queryByTestId('portal-chooser')).not.toBeInTheDocument()
  })
})
