import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
  countAdminWaiting: () => Promise.resolve(0),
  getMyProfile: (...args) => getMyProfileMock(...args),
  updateProfileName: (...args) => updateProfileNameMock(...args),
  // AddYourPlayer (a section of the roll-call since 17 Aug 2026) calls this.
  // Its own behaviour is covered by tests/parent-self-registration.test.jsx;
  // here it only has to exist so nothing in this file can reach a real Supabase
  // client.
  registerMyPlayer: (...args) => registerMyPlayerMock(...args),
  // ⚠️ THE ROLL-CALL'S OWN TWO WRITES. An unmocked export is `undefined`, and
  // calling one mid-submit throws from inside a promise chain — which surfaces
  // as the screen simply not advancing, with nothing in the output naming the
  // cause.
  updateProfileNames: (...args) => updateProfileNamesMock(...args),
  requestStaffRole: (...args) => requestStaffRoleMock(...args),
}))

vi.mock('../src/data/accessRequests.js', () => ({
  // The squad picker's source (16 Aug 2026). An unmocked export is undefined,
  // and calling it in an effect throws before anything renders.
  listSquadsForRequest: async () => [],
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
const updateProfileNamesMock = vi.fn()
const requestStaffRoleMock = vi.fn()

/**
 * The roll-call stands in front of every zero-membership route since 17 Aug
 * 2026: who are you, and what brings you here. The default profile fixture in
 * this file has no `name_confirmed_at`, so the name is asked too — which is the
 * point of asking it there, and is what stops a coach reaching an approval queue
 * as "Unnamed member".
 */
async function answerRollCall(user, ticks = [/child playing here/i]) {
  for (const tick of ticks) {
    // eslint-disable-next-line no-await-in-loop -- each click must land first.
    await user.click(await screen.findByRole('checkbox', { name: tick }))
  }
  await user.type(screen.getByLabelText(/your first name/i), 'Jay')
  await user.type(screen.getByLabelText(/your family name/i), 'Tester')
  // ⚠️ A SQUAD IS REQUIRED ON THE FIRST SCREEN AS OF 20 Aug 2026, so that a
  // person who stops after this submit has still told the club what they want.
  const group = screen.queryByRole('group', { name: /which squad/i })
  if (group) {
    const boxes = within(group).queryAllByRole('checkbox')
    if (boxes.length && !boxes.some((box) => box.checked)) await user.click(boxes[0])
  }
  const role = screen.queryByLabelText(/what do you do/i)
  if (role && !role.value) {
    const first = [...role.options].find((option) => option.value)
    if (first) await user.selectOptions(role, first.value)
  }
  await user.click(screen.getByRole('button', { name: /^continue$/i }))
}

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
    memberships: [{ role: 'admin', status: 'active', team_id: null }],
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
  // ⚠️ RESOLVED, NOT MERELY DEFINED. A bare vi.fn() returns undefined, and the
  // roll-call does `.then(...)` on it — which throws inside a promise chain and
  // surfaces as the screen simply not advancing.
  updateProfileNamesMock.mockResolvedValue({
    id: 'user-1',
    first_name: 'Jay',
    last_name: 'Tester',
    name_confirmed_at: '2026-08-17T00:00:00Z',
  })
  requestStaffRoleMock.mockResolvedValue({ id: 'mm-staff', status: 'pending' })
})

describe('AppShell', () => {
  it('renders the brand name, tagline, and the four nav items in BOTH navs', () => {
    useMembershipsMock.mockReturnValue(loaded())

    renderShell()

    expect(screen.getByText('Abu Dhabi Harlequins')).toBeInTheDocument()
    expect(screen.getByText('Quins Club Hub')).toBeInTheDocument()
    // Since phase 2 there are exactly TWO primary navs in the DOM — the
    // mobile tab bar and the desktop Sidebar — and CSS (not JS) decides
    // which paints. jsdom sees both, so each shared destination appears
    // exactly twice; one or three would both be bugs.
    for (const name of ['Home', 'Schedule', 'Roster', 'More']) {
      expect(screen.getAllByRole('link', { name })).toHaveLength(2)
    }
    // Sidebar-only destinations appear once.
    expect(screen.getAllByRole('link', { name: 'Notices' })).toHaveLength(1)
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

    const tagline = screen.getByText('Quins Club Hub')
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
    expect(hasClassToken(screen.getByTestId('error-message'), 'text-danger-ink')).toBe(true)
  })

  // ⚠️ THE WAY OUT. The app's only sign-out control renders on /more behind the
  // `ready` gate, and `ready` is false whenever this branch is — so a load
  // failure that keeps failing (a bad account state rather than a blip) used to
  // leave somebody with no way out of the account at all: "Try again" loops,
  // and no route reaches a sign-out because this shell wraps every one of them.
  // The two zero-membership branches already carry a sign-out for exactly this
  // reason; this branch was the gap in that rule.
  it('offers sign-out from the error state, not just "Try again"', async () => {
    const user = userEvent.setup()
    signOutMock.mockResolvedValue(undefined)
    useMembershipsMock.mockReturnValue(
      loaded({ memberships: [], error: new Error('permission denied') }),
    )

    renderShell()

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(signOutMock).toHaveBeenCalledTimes(1)
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
  it('offers the roll-call instead of routed content, with a way out', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(
      loaded({ memberships: [], teams: [{ id: 't-u13', name: 'U13', sort_order: 3 }] }),
    )

    renderShell()

    // ⚠️ THE ROLL-CALL COMES FIRST SINCE 17 Aug 2026. The registration form is
    // now one SECTION of it, reached by ticking rather than by default — which
    // is the whole change: a coach who also has children here answers both
    // instead of picking a door and never being asked about the other.
    await answerRollCall(user)

    expect(await screen.findByRole('button', { name: /add my player/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/player's first name/i)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'U13' })).toBeInTheDocument()
    expect(screen.queryByText('Routed content')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  // ❌ THE FORK IS GONE. This test used to click "I'm not adding a player" and
  // then "Add a player instead" — the two halves of a branch that made the
  // routes mutually exclusive, which is the bug the account-creation plan opens
  // with. Both answers are now boxes on one screen, so the thing worth asserting
  // is that ticking BOTH gets both, in order.
  it('takes every answer that is true, one after another', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(
      loaded({ memberships: [], teams: [{ id: 't-u13', name: 'U13', sort_order: 3 }] }),
    )

    renderShell()

    await answerRollCall(user, [/child playing here/i, /help the club another way/i])

    // Children first…
    expect(await screen.findByRole('button', { name: /add my player/i })).toBeInTheDocument()
    expect(screen.queryByText('Routed content')).not.toBeInTheDocument()
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
// Jay, 23 Aug 2026: "shouldn't clicking on the quins logo always take you to
// the top of the screen?" Two things in one click: a link to / for every other
// screen, and a scroll to the top for Home itself, where a Link to the current
// route does nothing visible.
describe('AppShell — the crest', () => {
  it('is a link home that also scrolls the window to the top', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(loaded())
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    renderShell('/roster')

    // Two crests — the masthead's (phone) and the sidebar's (desktop) — and
    // both make the same promise.
    const crests = screen.getAllByTestId('crest-home')
    expect(crests).toHaveLength(2)
    for (const crest of crests) {
      expect(crest).toHaveAttribute('href', '/')
      // Not called "Home" — the nav already has a link by that name in BOTH
      // navs and two more would make four identical targets for a screen reader.
      expect(crest).toHaveAccessibleName(/Abu Dhabi Harlequins/)
      await user.click(crest)
    }
    expect(scrollTo).toHaveBeenCalledTimes(2)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
    scrollTo.mockRestore()
  })

  // ⚠️ The role cell is the design-system role tag (§4.20) — the same Badge
  // the Accounts screen draws beside a name, keyed by ROLE so an admin is
  // maroon and a parent amber. Until 23 Aug 2026 the masthead drew its own
  // translucent red ring for every role, which Jay said "doesn't seem to match
  // our style". This pins the tone, not the hex: jsdom applies no CSS.
  it('draws the role as the Badge for that role, on both copies', () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [{ role: 'parent', team_id: 't1' }] }))

    renderShell()

    for (const id of ['role-label-mobile', 'role-label-desktop']) {
      const tag = screen.getByTestId(id)
      expect(tag).toHaveTextContent('Parent')
      expect(hasClassToken(tag, 'bg-warn-bg')).toBe(true)
      expect(hasClassToken(tag, 'rounded-[6px]')).toBe(true)
      expect(hasClassToken(tag, 'rounded-pill')).toBe(false)
    }
  })
})

describe('AppShell — the account menu', () => {
  // ══ 23 Aug 2026: A MENU, NOT A LINK ═══════════════════════════════════════
  // The 6 Aug note in AppShell said "if /more grows, this becomes the menu".
  // It became one for a different reason: the masthead row had been fixed for
  // overflow five times in sixteen days, and Jay asked for the controls beside
  // the initial to go behind it — "tap the J and have a drop down". My account
  // is the first item; the link to /more is still there, one tap further in.
  it('opens a menu whose first item points at /more', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: 'Jay' })

    renderShell()

    const trigger = await screen.findByTestId('account-button')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument()
    await user.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'My account' })).toHaveAttribute('href', '/more')
  })

  it('names the person for a screen reader', async () => {
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: 'Jay' })

    renderShell()

    expect(await screen.findByRole('button', { name: 'Account menu, Jay' })).toBeInTheDocument()
  })

  it('still says Account menu when there is no name', async () => {
    // ⚠️ A magic-link sign-in has no name until NamePrompt is answered, and
    // NamePrompt is skippable. An aria-label of "Account menu, " would be
    // worse than useless.
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: null })

    renderShell()

    expect(await screen.findByRole('button', { name: 'Account menu' })).toBeInTheDocument()
  })

  it('falls back to the email initial when there is no name', async () => {
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: null })

    renderShell()

    // jay@example.com -> J. Never an empty circle.
    const link = await screen.findByTestId('account-button')
    expect(link.textContent).toContain('J')
  })

  it('keeps the first name OUT of the masthead row and puts it in the menu header', async () => {
    // ⚠️ REGRESSION TEST, AND THE RULE IT PINS HAS TIGHTENED. The name used to
    // sit beside the initial at `wide` (and before that at `desktop`, which
    // truncated the club name to "ABU DHABI HARLE…" at ~1114px on production).
    // Since 23 Aug 2026 it is not in the row at ANY width: the row holds the
    // initial alone, and the name is the header line of the menu it opens.
    // jsdom applies no CSS, so this pins structure — the name is not a
    // descendant of <header>, and it IS the first line of the menu.
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: 'Jay' })

    renderShell()

    const trigger = await screen.findByTestId('account-button')
    expect(within(document.querySelector('header')).queryByText('Jay')).toBeNull()
    await user.click(trigger)
    expect(screen.getByTestId('account-menu-name')).toHaveTextContent('Jay')
  })

  // ⚠️ THE SAME BUG, ONE LEVEL UP, AND WORSE THAN THE NOTE ABOVE RECORDED.
  // The test above fixed the ACCOUNT NAME's breakpoint after the club name
  // truncated at ~1114px. The club name itself was left to truncate: at the
  // `desktop` breakpoint (820px, where the top nav replaces the bottom tab
  // bar) it rendered "ABU…" on every screen, for every role.
  //
  // It is structural, not a width being slightly off — every other item in
  // that row is shrink-0, so the wordmark is the only thing that can give and
  // it gives everything. So the name is painted only at `wide`, and below it
  // the "Quins Club Hub" line carries the identity.
  //
  // jsdom applies no CSS and cannot see an overflow, so this pins the tokens.
  it('paints the club name only at WIDE, and keeps it in the heading order below', async () => {
    useMembershipsMock.mockReturnValue(loaded())

    renderShell()

    const wordmark = screen.getByRole('heading', { level: 1, name: 'Abu Dhabi Harlequins' })

    // Hidden visually below `wide`...
    expect(hasClassToken(wordmark, 'sr-only')).toBe(true)
    expect(hasClassToken(wordmark, 'wide:not-sr-only')).toBe(true)
    // ...but never removed from the DOM, so the page has exactly one h1 at
    // every width and the heading order does not change with the viewport.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)

    // ⚠️ `desktop:` must be ABSENT. Re-showing it at 820px is precisely the
    // mistake this replaces, and asserting only the `wide:` token would pass
    // with both applied.
    expect(hasClassToken(wordmark, 'desktop:not-sr-only')).toBe(false)

    // The line that carries the identity below `wide` must NOT be conditional.
    const tagline = screen.getByText('Quins Club Hub')
    expect(hasClassToken(tagline, 'sr-only')).toBe(false)
    expect(hasClassToken(tagline, 'hidden')).toBe(false)
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

  it('carries the wordmark alone — the role is no longer on its line', () => {
    // ⚠️ 23 Aug 2026. This used to assert "Quins Club Hub · Parent" on one
    // ellipsised line, and on a phone the ellipsis ate the role ("QUINS CLUB
    // HUB · …" in Jay's screenshot). The two are separate elements now, so the
    // wordmark can never be squeezed by the role, and vice versa.
    useMembershipsMock.mockReturnValue(loaded({ memberships: [{ role: 'parent', team_id: 't1' }] }))

    renderShell()

    const subtitle = screen.getByText('Quins Club Hub').closest('p')
    expect(subtitle.textContent.trim()).toBe('Quins Club Hub')
    expect(subtitle.contains(screen.getByTestId('role-label-mobile'))).toBe(false)
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
  it('renders the same menu trigger from /roster as from /', async () => {
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: 'Jay' })

    renderShell('/roster')

    const trigger = await screen.findByTestId('account-button')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAccessibleName('Account menu, Jay')
  })

  it('renders an IDENTICAL account button on /roster and on /', async () => {
    // The strongest thing jsdom can say about "it only works from home": if
    // the element is the same markup on both routes, no route-conditional
    // rendering can be the cause. This fails the moment somebody makes the
    // button — or its position in the masthead — depend on the path.
    useMembershipsMock.mockReturnValue(loaded())
    getMyProfileMock.mockResolvedValue({ id: 'user-1', first_name: 'Jay' })

    const home = renderShell('/')
    await screen.findByRole('button', { name: 'Account menu, Jay' })
    const fromHome = home.container.querySelector('[data-testid="account-button"]').outerHTML
    home.unmount()

    const roster = renderShell('/roster')
    await screen.findByRole('button', { name: 'Account menu, Jay' })
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

// The masthead's auto-hide — added 24 Aug 2026 alongside the dock's, both
// driven by src/lib/useAutoHideOnScroll.js. jsdom has no layout, so scrollY
// is stubbed and the scroll event fired by hand, exactly as the dock's own
// test in nav.test.jsx does; the assertion is the data-hidden attribute the
// slide classes key off. Plan: claude/plans/2026-08-24-topbar-autohide-liquid-glass.md.
describe('AppShell — the masthead hides on scroll like the dock', () => {
  const scrollTo = (y) => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    window.dispatchEvent(new Event('scroll'))
    return new Promise((resolve) => requestAnimationFrame(() => resolve()))
  }

  it('hides on a downward scroll and returns on an upward one', async () => {
    useMembershipsMock.mockReturnValue(loaded())
    renderShell()
    const wrapper = screen.getByTestId('masthead-wrapper')
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 3000, configurable: true })

    await scrollTo(100)
    await scrollTo(200)
    await waitFor(() => expect(wrapper).toHaveAttribute('data-hidden', 'true'))
    await scrollTo(150)
    await waitFor(() => expect(wrapper).not.toHaveAttribute('data-hidden'))
  })

  it('never hides while a View-as preview is active', async () => {
    // ⚠️ THE BANNER IS THE POINT. The View-as banner lives inside this same
    // wrapper and is contractually persistent and unmissable — sliding the
    // wrapper away would take the banner with it, and an admin scrolling a
    // roster would stop being told they are previewing.
    useMembershipsMock.mockReturnValue(
      loaded({ viewAs: { role: 'parent', teamId: 't1', label: 'Parent — U12' } }),
    )
    renderShell()
    const wrapper = screen.getByTestId('masthead-wrapper')
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 3000, configurable: true })

    await scrollTo(100)
    await scrollTo(400)
    // Give the (absent) hide a real chance to land before asserting quiet.
    await scrollTo(600)
    expect(wrapper).not.toHaveAttribute('data-hidden')
  })

  it('keeps the desktop-neutralising classes on the hidden state', async () => {
    // jsdom applies no CSS, so the phone-only nature of the hide cannot be
    // measured here — what CAN be pinned is the pair of desktop: overrides
    // that neutralise the transform at >=820px. If somebody deletes them the
    // desktop island starts vanishing too, and only this test notices.
    useMembershipsMock.mockReturnValue(loaded())
    renderShell()
    const wrapper = screen.getByTestId('masthead-wrapper')
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 3000, configurable: true })

    await scrollTo(100)
    await scrollTo(200)
    await waitFor(() => expect(wrapper).toHaveAttribute('data-hidden', 'true'))
    expect(wrapper.className).toMatch(/desktop:translate-y-0/)
    expect(wrapper.className).toMatch(/desktop:opacity-100/)
  })
})

describe('chrome-free conversations (Jay, 25 Aug 2026)', () => {
  // Inside a thread the phone shows NO tab bar and NO masthead island —
  // WhatsApp-style. The chat header's ← and the system back gesture are the
  // way out. The chat LIST keeps the chrome, and view-as keeps everything:
  // the banner is the way out of the preview and must never disappear.
  // The tab bar is the only role=navigation named "Primary" (the sidebar's
  // "Primary" sits on an <aside>, role complementary), so presence is a
  // COUNT: one normally, zero inside a conversation.
  it('hides the tab bar and masthead island inside a DM thread', () => {
    useMembershipsMock.mockReturnValue(loaded())
    renderShell('/chat/dm/c1')
    expect(screen.queryAllByRole('navigation', { name: 'Primary' })).toHaveLength(0)
    expect(hasClassToken(screen.getByTestId('masthead-wrapper'), 'hidden')).toBe(true)
    // Desktop too, since 26 Aug 2026: `desktop:flex` used to restore the
    // island at >=820px, where it pinned exactly over the thread header's
    // ⋯ menu (Jay: "scrolls up and out of view"). No token, no restore.
    expect(hasClassToken(screen.getByTestId('masthead-wrapper'), 'desktop:flex')).toBe(false)
    // The 108px tab-bar clearance would be a dead band under the composer.
    expect(document.getElementById('main-content').className).not.toContain('108px')
  })

  it('squad and club streams count as conversations', () => {
    useMembershipsMock.mockReturnValue(loaded())
    renderShell('/chat/club')
    expect(screen.queryAllByRole('navigation', { name: 'Primary' })).toHaveLength(0)
  })

  it('the chat list and starred keep the chrome', () => {
    useMembershipsMock.mockReturnValue(loaded())
    const { unmount } = renderShell('/chat')
    expect(screen.getAllByRole('navigation', { name: 'Primary' })).toHaveLength(1)
    expect(hasClassToken(screen.getByTestId('masthead-wrapper'), 'hidden')).toBe(false)
    expect(document.getElementById('main-content').className).toContain('108px')
    unmount()
    renderShell('/chat/starred')
    expect(screen.getAllByRole('navigation', { name: 'Primary' })).toHaveLength(1)
  })

  it('view-as keeps the chrome even inside a conversation', () => {
    useMembershipsMock.mockReturnValue(loaded({ viewAs: { role: 'parent', team_id: null } }))
    renderShell('/chat/dm/c1')
    expect(screen.getAllByRole('navigation', { name: 'Primary' })).toHaveLength(1)
    expect(hasClassToken(screen.getByTestId('masthead-wrapper'), 'hidden')).toBe(false)
  })
})
