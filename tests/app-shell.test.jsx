import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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

// The zero-membership branch renders RequestAccess, which reads the caller's
// own profile and access request. Mocked here so those tests exercise the
// real "you can ask for access" screen deterministically rather than
// whatever a failed network call happens to render. The request-access
// behaviour itself is covered by tests/request-access.test.jsx.
vi.mock('../src/data/members.js', () => ({
  getMyProfile: (...args) => getMyProfileMock(...args),
  updateProfileName: (...args) => updateProfileNameMock(...args),
  // AddYourPlayer (the zero-membership primary route since 8 Aug 2026) calls
  // this. Its own behaviour is covered by
  // tests/parent-self-registration.test.jsx; here it only has to exist so
  // nothing in this file can reach a real Supabase client.
  registerMyPlayer: (...args) => registerMyPlayerMock(...args),
}))

vi.mock('../src/data/accessRequests.js', () => ({
  getMyAccessRequest: (...args) => getMyAccessRequestMock(...args),
  createAccessRequest: (...args) => createAccessRequestMock(...args),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// Import after vi.mock so this binds to the mocked modules.
import AppShell from '../src/components/AppShell.jsx'
import { clearMyProfileCache } from '../src/lib/useMyProfile.js'

const signOutMock = vi.fn()
const getMyProfileMock = vi.fn()
const updateProfileNameMock = vi.fn()
const getMyAccessRequestMock = vi.fn()
const createAccessRequestMock = vi.fn()
const registerMyPlayerMock = vi.fn()

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
  // ⚠️ useMyProfile caches at module level keyed by user id. Without this the
  // first test's profile leaks into every later one, and the no-name case
  // would still render a name.
  clearMyProfileCache()
  useAuthMock.mockReset()
  useMembershipsMock.mockReset()
  signOutMock.mockReset()
  useAuthMock.mockReturnValue({
    user: { id: 'user-1', email: 'jay@example.com' },
    signOut: signOutMock,
  })
  getMyAccessRequestMock.mockResolvedValue(null)
  getMyProfileMock.mockResolvedValue({ id: 'user-1', full_name: '', email: 'jay@example.com' })
  createAccessRequestMock.mockResolvedValue({ id: 'req-1', status: 'pending' })
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
  // that's what the real-browser Playwright pass in claude/specs/accessibility.md
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

  // ⚠️ REPOINTED 8 Aug 2026. The zero-membership branch used to render
  // RequestAccess, whose copy names the signed-in address — hence the old
  // /jay@example.com/ assertion. It now renders AddYourPlayer first (parent
  // self-registration), and that screen deliberately does NOT lead with the
  // email: the question it asks is "who is your player", not "why didn't we
  // recognise you". The address still appears on the secondary route, which
  // the test below reaches.
  //
  // The invariant this test actually exists for is unchanged and still
  // asserted: routed content stays hidden, and sign-out stays reachable from
  // whatever a person with no access is shown.
  it('offers the add-your-player route instead of routed content, with a way out', async () => {
    useMembershipsMock.mockReturnValue(
      loaded({ memberships: [], teams: [{ id: 't-u13', name: 'U13', sort_order: 3 }] }),
    )

    renderShell()

    expect(await screen.findByRole('button', { name: /add my player/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/player's full name/i)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'U13' })).toBeInTheDocument()
    expect(screen.queryByText('Routed content')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  // The secondary route, and the reason it is kept: not everybody signing in
  // is a parent. A coach or a committee member has no child to register, and
  // before self-registration this screen was the only way in for them.
  it('keeps the ask-the-club route reachable, and reversible', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(
      loaded({ memberships: [], teams: [{ id: 't-u13', name: 'U13', sort_order: 3 }] }),
    )

    renderShell()

    await user.click(await screen.findByRole('button', { name: /not adding a player/i }))

    expect(await screen.findByText(/jay@example.com/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /request access/i })).toBeInTheDocument()
    expect(screen.queryByText('Routed content')).not.toBeInTheDocument()

    // Back again. Someone who opened this by mistake must not have to sign out
    // and in to reach the form they actually wanted.
    await user.click(screen.getByRole('button', { name: /add a player instead/i }))
    expect(await screen.findByRole('button', { name: /add my player/i })).toBeInTheDocument()
  })

  it('sign-out from the zero-membership state calls signOut', async () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [] }))
    signOutMock.mockResolvedValue(undefined)
    const user = userEvent.setup()

    renderShell()
    await user.click(await screen.findByRole('button', { name: /sign out/i }))

    expect(signOutMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a sign-out failure instead of throwing', async () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [] }))
    signOutMock.mockRejectedValue(new Error('network unreachable'))
    const user = userEvent.setup()

    renderShell()
    await user.click(await screen.findByRole('button', { name: /sign out/i }))

    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument()
  })

  it('offers sign-out on the More route once memberships have loaded', () => {
    useMembershipsMock.mockReturnValue(loaded())

    renderShell('/more', <h1>More</h1>)

    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  // ⚠️ The regression guard for the admin-dashboard plan. /more used to be
  // an admin-only screen, and the temptation when building /admin is to
  // redirect /more into it — which would take the ONLY sign-out control in
  // the app away from every parent, player and coach. A parent, specifically,
  // because they are the role with no management route to fall back on.
  // tests/app.test.jsx proves the same thing through the real App and router.
  it('a parent can sign out from the More route', async () => {
    useMembershipsMock.mockReturnValue(
      loaded({
        memberships: [{ role: 'parent', team_id: 't1', player_id: 'p1' }],
        teams: [{ id: 't1', name: 'U12 Boys', sort_order: 4 }],
      }),
    )
    signOutMock.mockResolvedValue(undefined)
    const user = userEvent.setup()

    renderShell('/more', <h1>More</h1>)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(signOutMock).toHaveBeenCalledTimes(1)
  })

  it('does not show a More sign-out control on other routes', () => {
    useMembershipsMock.mockReturnValue(loaded())

    renderShell('/', <h1>Home</h1>)

    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })
})

describe('AppShell — Admin nav gating (admin-dashboard plan, 2026-08-05)', () => {
  it('passes canManageClub=true to Nav for an admin', () => {
    useMembershipsMock.mockReturnValue(loaded())

    renderShell()

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
  })

  // The old `canManage` was admin OR coach, because it gated /overview.
  // /overview is gone and /admin is admin-only, so a coach now gets no
  // management pill at all.
  it('does not offer the Admin pill to a coach', () => {
    useMembershipsMock.mockReturnValue(
      loaded({
        memberships: [{ role: 'coach', team_id: 't1' }],
        teams: [{ id: 't1', name: 'U12 Boys', sort_order: 4 }],
      }),
    )

    renderShell()

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('does not offer the Admin pill to a parent', () => {
    useMembershipsMock.mockReturnValue(
      loaded({
        memberships: [{ role: 'parent', team_id: 't1', player_id: 'p1' }],
        teams: [{ id: 't1', name: 'U12 Boys', sort_order: 4 }],
      }),
    )

    renderShell()

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('offers no Overview or Accounts pill to anyone any more', () => {
    useMembershipsMock.mockReturnValue(loaded())

    renderShell()

    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()
  })
})

// Added 6 Aug 2026. Before this the only route to your own account was
// knowing that "More" contained it.
describe('AppShell — my account button', () => {
  it('points at /more', async () => {
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: 'Jay' })

    renderShell()

    const link = await screen.findByTestId('account-button')
    expect(link).toHaveAttribute('href', '/more')
  })

  it('names the person for a screen reader', async () => {
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: 'Jay' })

    renderShell()

    expect(await screen.findByRole('link', { name: 'My account, Jay' })).toBeInTheDocument()
  })

  it('still says My account when there is no name', async () => {
    // ⚠️ A magic-link sign-in has no name until NamePrompt is answered, and
    // NamePrompt is skippable. An aria-label of "My account, " would be worse
    // than useless.
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: null })

    renderShell()

    expect(await screen.findByRole('link', { name: 'My account' })).toBeInTheDocument()
  })

  it('falls back to the email initial when there is no name', async () => {
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: null })

    renderShell()

    // jay@example.com -> J. Never an empty circle.
    const link = await screen.findByTestId('account-button')
    expect(link.textContent).toContain('J')
  })

  it('shows the name only at the WIDE breakpoint, not merely desktop', async () => {
    // ⚠️ REGRESSION TEST. Shipped as `desktop:inline` (820px) and it truncated
    // the club name to "ABU DHABI HARLE…" at ~1114px on production. jsdom
    // applies no real CSS, so no test could have caught the overflow itself —
    // this pins the breakpoint token that was wrong instead.
    //
    // `desktop:inline` must be ABSENT, not just `wide:inline` present:
    // asserting only the latter would still pass if both were applied.
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: 'Jay' })

    renderShell()

    const link = await screen.findByTestId('account-button')
    const nameEl = within(link).getByText('Jay')
    expect(hasClassToken(nameEl, 'hidden')).toBe(true)
    expect(hasClassToken(nameEl, 'wide:inline')).toBe(true)
    expect(hasClassToken(nameEl, 'desktop:inline')).toBe(false)
  })
})

// ⚠️ REPORTED FROM A REAL PHONE, 8 Aug 2026. A parent on a ~400px Android
// device saw the masthead render as:
//
//     ABU DHABI HARLEQ…
//     QUINS CLUB      · PARE…
//     HUB
//
// The subtitle was a flex row (`flex items-baseline gap-1`) whose first span
// had no nowrap and no shrink-0, so when the masthead squeezed it the only way
// that span could give ground was to break its own text — while the role span,
// being `truncate`, could shrink to zero and absorbed none of the squeeze.
//
// ⚠️ NONE OF THE TESTS BELOW WOULD HAVE CAUGHT THE ORIGINAL. jsdom applies no
// CSS, has no layout, and cannot tell a wrapped line from an unwrapped one —
// exactly the blind spot recorded on the account link's `wide:` vs `desktop:`
// test above. What they pin is the class tokens and the DOM shape that decide
// the behaviour once real CSS applies, which is the most jsdom can do.
describe('AppShell — the masthead subtitle is ONE line', () => {
  it('is a single truncating line, not a flex row that can break mid-phrase', () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [{ role: 'parent', team_id: 't1' }] }))

    renderShell()

    const subtitle = screen.getByText('Quins Club Hub').closest('p')

    // `truncate` is white-space:nowrap + overflow:hidden + ellipsis. nowrap is
    // the half that makes the wrap impossible; the ellipsis is what the line
    // does instead when it runs out of room.
    expect(hasClassToken(subtitle, 'truncate')).toBe(true)
    // The flex row is the mechanism the bug needed. Its absence is the fix, so
    // assert the absence rather than only the presence of the replacement —
    // `truncate` on a flex container would still let the inner span wrap.
    expect(hasClassToken(subtitle, 'flex')).toBe(false)
  })

  it('reads as one line of text, wordmark then role', () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [{ role: 'parent', team_id: 't1' }] }))

    renderShell()

    const subtitle = screen.getByText('Quins Club Hub').closest('p')
    // The separator moved inside the role span when the flex `gap-1` went, so
    // this also guards against losing the spaces around it and rendering
    // "Quins Club Hub·Parent".
    expect(subtitle.textContent).toBe('Quins Club Hub · Parent')
  })

  it('still carries the mobile role label, still hidden only at the desktop breakpoint', () => {
    // ⚠️ The fix must not quietly drop either of these. The role has to be
    // visible SOMEWHERE at every width: the desktop pill covers >=820px and
    // this covers below it, so a bare `hidden` here would leave a phone with
    // no role label at all — the Task 8 review finding, all over again.
    useMembershipsMock.mockReturnValue(loaded({ memberships: [{ role: 'parent', team_id: 't1' }] }))

    renderShell()

    const mobileRole = screen.getByTestId('role-label-mobile')
    expect(mobileRole).toHaveTextContent('Parent')
    expect(hasClassToken(mobileRole, 'hidden')).toBe(false)
    expect(hasClassToken(mobileRole, 'desktop:hidden')).toBe(true)
  })
})

// The second half of the same report: "tapping the initial only works from the
// home tab". The working theory was that the block to its left was overflowing
// and painting over it.
//
// ⚠️ IT WAS NOT, and these tests record what was actually found. Nothing in
// AppShell's masthead is route-conditional — the only path-dependent branch in
// the file is the sign-out block, which renders inside <main> on /more — so the
// account button is byte-for-byte the same element on every route. The two
// things that ARE true: the wrap made this block three lines tall beside a 36px
// circle, which is a mis-tap waiting to happen; and on /more the link points at
// the page you are already on, so it does nothing visible. Fixing the wrap
// addresses the first, and the second is not a bug.
//
// jsdom cannot answer "is this element covered by another one" — it has no
// layout. What it CAN pin is the three structural facts the overlap theory
// turned on, which is what these do.
describe('AppShell — the account button on a route that is not home', () => {
  it('renders and points at /more from /roster, exactly as it does from /', async () => {
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: 'Jay' })

    renderShell('/roster')

    const link = await screen.findByTestId('account-button')
    expect(link).toHaveAttribute('href', '/more')
    expect(link).toHaveAccessibleName('My account, Jay')
  })

  it('renders an IDENTICAL account button on /roster and on /', async () => {
    // The strongest thing jsdom can say about "it only works from home": if
    // the element is the same markup on both routes, no route-conditional
    // rendering can be the cause. This fails the moment somebody makes the
    // button — or its position in the masthead — depend on the path.
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: 'Jay' })

    const home = renderShell('/')
    await screen.findByRole('link', { name: 'My account, Jay' })
    const fromHome = home.container.querySelector('[data-testid="account-button"]').outerHTML
    home.unmount()

    const roster = renderShell('/roster')
    await screen.findByRole('link', { name: 'My account, Jay' })
    const fromRoster = roster.container.querySelector('[data-testid="account-button"]').outerHTML

    expect(fromRoster).toBe(fromHome)
  })

  it('keeps the club-name block clipped, and painting BEFORE the account button', async () => {
    // The two structural guards against the overlap theory ever becoming true.
    //
    // `min-w-0` lets the block be sized by the flex algorithm and `overflow-hidden`
    // clips whatever is inside it, so it cannot paint outside its own box
    // whatever its children do. And it is an EARLIER sibling, so in a stack of
    // untransformed, unpositioned flex items the account button paints last —
    // meaning even a spill would not take the taps.
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: 'Jay' })

    const { container } = renderShell('/roster')
    const link = await screen.findByTestId('account-button')
    const nameBlock = container.querySelector('h1').parentElement

    expect(hasClassToken(nameBlock, 'min-w-0')).toBe(true)
    expect(hasClassToken(nameBlock, 'overflow-hidden')).toBe(true)
    // Node.DOCUMENT_POSITION_FOLLOWING === 4: the link comes after the block.
    expect(nameBlock.compareDocumentPosition(link) & 4).toBeTruthy()
  })
})
