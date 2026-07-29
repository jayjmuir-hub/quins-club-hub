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

  it('renders the crest with a meaningful alt and without a cropping object-fit class', () => {
    // Regression: crest.png is 369x400 (portrait) inside a square badge box.
    // object-cover (or the unstyled default object-fit:fill) either crops or
    // visually flattens the shield's pointed base — confirmed by rendering
    // the real components in Chromium (Task 8 review). object-contain keeps
    // the native aspect ratio instead.
    useMembershipsMock.mockReturnValue(loaded())

    renderShell()

    const crestImg = screen.getByRole('img', { name: /crest/i })
    expect(crestImg).toHaveAttribute('alt', expect.not.stringMatching(/^$/))
    const classes = crestImg.className.split(/\s+/)
    expect(classes).toContain('object-contain')
    expect(classes).not.toContain('object-cover')
  })

  it('sets the tagline in the condensed face at one size across breakpoints', () => {
    useMembershipsMock.mockReturnValue(loaded())

    renderShell()

    const tagline = screen.getByText('Quins Club Hub').parentElement
    // Retheme: the tagline no longer steps 11.5px -> 12px across the
    // breakpoint. It is Barlow Condensed at a single 13px, which reads at the
    // same optical size as the old 11.5px Barlow (condensed faces need more
    // point size for equal apparent size) and so needs no breakpoint step.
    // What still matters, and is what this now pins, is that it uses the
    // condensed face rather than silently falling back to body Barlow.
    expect(hasClassToken(tagline, 'font-condensed')).toBe(true)
    expect(hasClassToken(tagline, 'text-[13px]')).toBe(true)
    expect(tagline.className.split(/\s+/).some((c) => c.startsWith('desktop:text-'))).toBe(false)
  })

  // Task 22: skip-to-content link (the one confirmed-open gap left by
  // design-system.md §8). jsdom can't tell us whether sr-only actually hides
  // it visually or whether focus-visible ring colours render correctly —
  // that's what the real-browser Playwright pass in docs/accessibility.md
  // §2 is for. What jsdom *can* verify, and is worth pinning here so a
  // future change can't silently regress it: it exists, is the first
  // element AppShell renders, points at the right target, and that target
  // is genuinely programmatically focusable.
  it('renders a skip-to-content link as the very first element, pointing at a focusable <main>', () => {
    useMembershipsMock.mockReturnValue(loaded())

    const { container } = renderShell()

    const skipLink = screen.getByRole('link', { name: 'Skip to content' })
    expect(skipLink).toHaveAttribute('href', '#main-content')
    // "very first element" per the brief: nothing above it in the DOM that
    // AppShell itself controls (MemoryRouter/render() wrapper aside).
    expect(container.querySelector('a, button, input, [tabindex]')).toBe(skipLink)

    const main = document.getElementById('main-content')
    expect(main).not.toBeNull()
    expect(main.tagName).toBe('MAIN')
    // tabIndex={-1}: focusable programmatically (by the skip link's href
    // jump) without joining the normal Tab sequence.
    expect(main).toHaveAttribute('tabindex', '-1')

    main.focus()
    expect(document.activeElement).toBe(main)
  })

  it('the skip link is visually hidden (sr-only) until it receives focus', () => {
    useMembershipsMock.mockReturnValue(loaded())

    renderShell()

    const skipLink = screen.getByRole('link', { name: 'Skip to content' })
    expect(hasClassToken(skipLink, 'sr-only')).toBe(true)
    expect(hasClassToken(skipLink, 'focus:not-sr-only')).toBe(true)
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

    // Regression: error text must use the brand-deep token (binding
    // global constraint), not a muted grey — see Task 8 review finding.
    expect(hasClassToken(screen.getByTestId('error-message'), 'text-brand-deep')).toBe(true)
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
