import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Unit tests for src/components/AppShell.jsx (Task 8). useAuth and
// useMemberships are both mocked so this exercises only AppShell's own
// rendering logic (header, nav placement, loading/error/zero-membership
// states, and where-sign-out-lives) — not the real MembershipProvider
// (tests/memberships.test.jsx) or AuthProvider (tests/auth.test.jsx). No
// network is ever reachable from this file.

const useAuthMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// Import after vi.mock so this binds to the mocked modules.
import AppShell from '../src/components/AppShell.jsx'

const signOutMock = vi.fn()

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true }

function renderShell(path = '/', children = <div>Routed content</div>) {
  return render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <AppShell>{children}</AppShell>
    </MemoryRouter>,
  )
}

function loaded(overrides = {}) {
  return {
    memberships: [{ role: 'admin', team_id: null }],
    teams: [],
    loading: false,
    error: null,
    reload: vi.fn(),
    ...overrides,
  }
}

// jsdom never applies real CSS, so `getByText(...).toBeInTheDocument()` alone
// cannot tell a genuinely-visible element from one Tailwind's bare `hidden`
// utility removes at this width — that gap is exactly how the mobile role
// label shipped invisible in the first Task 8 pass (review finding). This
// checks the literal class token instead, which is what's actually testable
// in jsdom and is what determines real visibility once real CSS applies.
// (`desktop:hidden` is a distinct token, so it won't false-match here.)
function hasClassToken(element, token) {
  return element.className.split(/\s+/).includes(token)
}

beforeEach(() => {
  useAuthMock.mockReset()
  useMembershipsMock.mockReset()
  signOutMock.mockReset()
  useAuthMock.mockReturnValue({ user: { email: 'jay@example.com' }, signOut: signOutMock })
})

describe('AppShell', () => {
  it('renders the brand name, tagline, and all four nav items', () => {
    useMembershipsMock.mockReturnValue(loaded())

    renderShell()

    expect(screen.getByText('Abu Dhabi Harlequins')).toBeInTheDocument()
    expect(screen.getByText('Quins Club Hub')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Schedule' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Roster' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'More' })).toBeInTheDocument()
  })

  it('the tagline steps up to 12px at the desktop breakpoint (design-system.md §2)', () => {
    useMembershipsMock.mockReturnValue(loaded())

    renderShell()

    const tagline = screen.getByText('Quins Club Hub').parentElement
    expect(hasClassToken(tagline, 'desktop:text-[12px]')).toBe(true)
  })

  it('renders the routed content and a role label once memberships have loaded', () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [{ role: 'coach', team_id: 't1' }] }))

    renderShell('/', <div>Routed content</div>)

    expect(screen.getByText('Routed content')).toBeInTheDocument()
    expect(screen.getByTestId('role-label-mobile')).toHaveTextContent('Coach')
    expect(screen.getByTestId('role-label-desktop')).toHaveTextContent('Coach')
  })

  it('the role label is not CSS-hidden on mobile (only the desktop copy is), and both copies carry the same role', () => {
    // Regression for the Task 8 review finding: the role badge was
    // `hidden ... desktop:inline-block`, which is correct for the desktop
    // copy but meant NO copy rendered visibly below 820px. There must be a
    // second, mobile-visible copy whose class list never includes a bare
    // `hidden` token.
    useMembershipsMock.mockReturnValue(loaded({ memberships: [{ role: 'coach', team_id: 't1' }] }))

    renderShell()

    const mobileRole = screen.getByTestId('role-label-mobile')
    const desktopRole = screen.getByTestId('role-label-desktop')

    expect(mobileRole).toHaveTextContent('Coach')
    expect(desktopRole).toHaveTextContent('Coach')
    expect(hasClassToken(mobileRole, 'hidden')).toBe(false)
    expect(hasClassToken(desktopRole, 'hidden')).toBe(true)
  })

  it('renders a loading state, and not the routed content, while memberships load', () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [], loading: true }))

    renderShell()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Routed content')).not.toBeInTheDocument()
  })

  it('renders an error state, not a blank screen, when membership loading fails', () => {
    useMembershipsMock.mockReturnValue(
      loaded({ memberships: [], error: new Error('permission denied') }),
    )

    renderShell()

    expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/i)
    expect(screen.queryByText('Routed content')).not.toBeInTheDocument()

    // Regression: error text must use the quinsRedDark token (binding
    // global constraint), not a muted grey — see Task 8 review finding.
    expect(hasClassToken(screen.getByTestId('error-message'), 'text-quinsRedDark')).toBe(true)
  })

  it('renders a zero-membership message with the signed-in email instead of routed content', () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [] }))

    renderShell()

    expect(screen.getByText(/jay@example.com/)).toBeInTheDocument()
    expect(screen.queryByText('Routed content')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('sign-out from the zero-membership state calls signOut', async () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [] }))
    signOutMock.mockResolvedValue(undefined)
    const user = userEvent.setup()

    renderShell()
    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(signOutMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a sign-out failure instead of throwing', async () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [] }))
    signOutMock.mockRejectedValue(new Error('network unreachable'))
    const user = userEvent.setup()

    renderShell()
    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument()
  })

  it('offers sign-out on the More route once memberships have loaded', () => {
    useMembershipsMock.mockReturnValue(loaded())

    renderShell('/more', <h1>More</h1>)

    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('does not show a More sign-out control on other routes', () => {
    useMembershipsMock.mockReturnValue(loaded())

    renderShell('/', <h1>Home</h1>)

    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })
})
