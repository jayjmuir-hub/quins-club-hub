import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Unit tests for the "view as" preview UI (Task 2 of the 2026-08-03 plan):
// src/components/ViewAsSwitcher.jsx's trigger/sheet and banner, mounted the
// way they really ship — inside AppShell. useAuth and useMemberships are
// mocked in the same style as tests/app-shell.test.jsx, so nothing here can
// reach the network and the provider's own logic (tests/memberships.test.jsx)
// is not re-tested.
//
// The load-bearing scenario in this file is "banner still there while
// previewing as a parent". Everything the admin needs to get back out of a
// preview gates on realMemberships; if any of it ever gates on the effective
// `memberships` instead, an admin previewing as a parent is soft-locked with
// no route back except clearing localStorage by hand.

const useAuthMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// Imported after vi.mock so these bind to the mocked modules.
import AppShell from '../src/components/AppShell.jsx'
import AdminDashboard from '../src/screens/AdminDashboard.jsx'
import { visibleTeams } from '../src/lib/scope.js'
import { useMemberships } from '../src/lib/memberships.jsx'

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true }

const TEAMS = [
  { id: 't1', name: 'U12 Boys', sort_order: 4 },
  { id: 't2', name: 'U14 Girls', sort_order: 6 },
]

const ADMIN_ROWS = [{ id: 'm1', role: 'admin', status: 'active', team_id: null, club_id: 'c1' }]

function synthetic(role, teamId) {
  return [{ id: 'view-as', role, team_id: teamId, player_id: null, club_id: 'c1' }]
}

const setViewAsMock = vi.fn()

function ctx(overrides = {}) {
  const realMemberships = overrides.realMemberships ?? ADMIN_ROWS
  return {
    // Effective set defaults to the real one — i.e. not previewing.
    memberships: realMemberships,
    realMemberships,
    viewAs: null,
    setViewAs: setViewAsMock,
    teams: TEAMS,
    loading: false,
    error: null,
    reload: vi.fn(),
    ...overrides,
  }
}

// jsdom applies no CSS, so a `hidden` Tailwind utility is invisible to
// getByRole/toBeVisible. The class token is what actually decides visibility
// once real CSS runs, so that is what gets asserted — same helper and same
// reasoning as tests/app-shell.test.jsx.
function hasClassToken(element, token) {
  return element.className.split(/\s+/).includes(token)
}

// Stands in for any of the 12 real screens: they all derive their scope from
// the EFFECTIVE membership set via scope.js, so this is a faithful proxy for
// "does picking a persona re-scope the app?".
function ScopedChild() {
  const { memberships, teams } = useMemberships()
  const names = visibleTeams(memberships, teams).map((team) => team.name)
  return <div data-testid="scoped-teams">{names.join(', ')}</div>
}

function renderShell(value, children = <ScopedChild />) {
  useMembershipsMock.mockReturnValue(value)
  return render(
    <MemoryRouter initialEntries={['/']} future={routerFuture}>
      <AppShell>{children}</AppShell>
    </MemoryRouter>,
  )
}

// The switcher moved out of the masthead and onto the Admin screen on
// 7 Aug 2026 (the club wordmark could not survive an admin's masthead at its
// 1120px cap — see AppShell.jsx's note at the old call site). So the trigger
// tests render it where it now lives, inside the shell exactly as it ships.
function renderAdmin(value) {
  useMembershipsMock.mockReturnValue(value)
  return render(
    <MemoryRouter initialEntries={['/admin']} future={routerFuture}>
      <AppShell>
        <AdminDashboard />
      </AppShell>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthMock.mockReset()
  useMembershipsMock.mockReset()
  setViewAsMock.mockReset()
  useAuthMock.mockReturnValue({ user: { email: 'jay@example.com' }, signOut: vi.fn() })
})

// Opens the account menu, then its "View as" page. Two clicks since 23 Aug
// 2026: the eye button that used to sit in the masthead is gone, and the
// persona list is the second page of the menu behind the person's initial.
async function openViewAs(user) {
  await user.click(screen.getByTestId('account-button'))
  await user.click(screen.getByTestId('view-as-trigger'))
}

// ══ 23 Aug 2026: THE TRIGGER MOVED INTO THE ACCOUNT MENU ═════════════════════
//
// Jay: "couldn't you tap the J and have a drop down or something? … we should
// also do a similar thing on the desktop version". The masthead row had been
// fixed for overflow five times in sixteen days — every control in it was
// `shrink-0` and the wordmark paid for all of them. Now the row carries ONE
// trigger, the initial, and View as / Dark mode / My account / Sign out live
// behind it at every width. The 14 Aug ruling ("from any screen") still holds:
// the menu is in AppShell, which wraps every routed screen.
describe('View as, reached through the account menu', () => {
  it('is offered to a real admin', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

    await user.click(screen.getByTestId('account-button'))
    expect(screen.getByTestId('view-as-trigger')).toBeInTheDocument()
  })

  it('is reachable from an ordinary screen, not only from /admin', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

    await openViewAs(user)
    expect(screen.getByTestId('view-as-menu')).toBeInTheDocument()
  })

  // ⚠️ THE WORDMARK GUARD. jsdom applies no CSS and cannot measure a layout
  // overflow — that is why the 7 Aug bug reached production — so this pins the
  // structural property instead: nothing View-as-shaped is in the masthead row
  // at all. The only thing in the row is the initial, and it is a fixed box.
  it('puts nothing in the masthead but the initial, which never grows with the persona', () => {
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    const header = document.querySelector('header')
    expect(header.querySelector('[data-testid="view-as-trigger"]')).toBeNull()
    const account = screen.getByTestId('account-button')
    expect(hasClassToken(account, 'h-9')).toBe(true)
    expect(hasClassToken(account, 'w-9')).toBe(true)
    expect(hasClassToken(account, 'shrink-0')).toBe(true)
    expect(account.textContent).not.toMatch(/coach|parent|u12|boys/i)
  })

  // The way OUT of a preview must not have moved with the way in. The banner
  // is what carries Exit, it renders at every width, and it is still in the
  // shell above the masthead.
  it('keeps the Exit preview button in the banner, outside the menu', () => {
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    expect(screen.getByRole('button', { name: /exit preview/i })).toBeInTheDocument()
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument()
  })

  it('is not offered to a coach', async () => {
    const user = userEvent.setup()
    renderAdmin(ctx({ realMemberships: [{ id: 'm9', role: 'coach', team_id: 't1' }] }))

    await user.click(screen.getByTestId('account-button'))
    expect(screen.queryByTestId('view-as-trigger')).not.toBeInTheDocument()
  })

  it('is not offered to a parent', async () => {
    const user = userEvent.setup()
    renderAdmin(
      ctx({ realMemberships: [{ id: 'm9', role: 'parent', team_id: 't1', player_id: 'p1' }] }),
    )

    await user.click(screen.getByTestId('account-button'))
    expect(screen.queryByTestId('view-as-trigger')).not.toBeInTheDocument()
  })

  // ⚠️ NOT desktop-only, and this is the assertion that delivers "from any
  // screen". A phone is a screen, and an admin standing on a touchline is
  // exactly who wants to check what a parent can see.
  it('the menu trigger is shown at every width', () => {
    renderShell(ctx())

    const account = screen.getByTestId('account-button')
    expect(hasClassToken(account, 'hidden')).toBe(false)
    expect(hasClassToken(account, 'desktop:block')).toBe(false)
  })

  // ⚠️ THE STATE IS NOT CARRIED BY COLOUR ALONE (claude/specs/accessibility.md).
  // A preview in progress shows on the INITIAL as a ring and a dot — the dot is
  // aria-hidden — and in words on the View as row inside the menu.
  it('shows a preview in progress on the initial, and says so on the View as row', async () => {
    const user = userEvent.setup()
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    const account = screen.getByTestId('account-button')
    expect(hasClassToken(account, 'ring-1')).toBe(true)

    await user.click(account)
    expect(screen.getByTestId('view-as-trigger')).toHaveTextContent(/on/i)
  })

  it('carries no preview marker when none is running', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

    const account = screen.getByTestId('account-button')
    expect(hasClassToken(account, 'ring-1')).toBe(false)
    await user.click(account)
    expect(screen.getByTestId('view-as-trigger')).toHaveTextContent(/^View as$/)
  })
})

// ⚠️ A DROPDOWN, NOT A `Sheet`, SINCE 14 Aug 2026 (Jay asked for one by name).
// These render through the shell on an ORDINARY screen, because that is the
// change: the picker is no longer reachable only from /admin.
//
// ⚠️ THE THREE BEHAVIOURS `Sheet` USED TO PROVIDE ARE NOW HAND-WRITTEN, so they
// need holding here — Escape, outside-click and focus return. The account link
// two elements along in the masthead is deliberately a plain <Link> BECAUSE
// nobody wanted to write them; if these tests are ever deleted, that comment in
// AppShell.jsx becomes the only thing standing behind them.
describe('ViewAsSwitcher menu', () => {
  it('opens from an ordinary screen, not only from /admin', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

    expect(screen.queryByTestId('view-as-menu')).not.toBeInTheDocument()
    await openViewAs(user)
    expect(screen.getByTestId('view-as-menu')).toBeInTheDocument()
  })

  // ⚠️ THE REGRESSION THIS EXISTS TO HOLD, AND IT SHIPPED TO PRODUCTION.
  //
  // The panel was `absolute` inside the trigger's wrapper, and the masthead row
  // carries `overflow-hidden` — deliberately, to clip the `harlequin` diagonals
  // that bleed off its right edge. An absolutely-positioned child of a clipped
  // ancestor is clipped with it, so the menu rendered as a ~6px sliver.
  //
  // ⚠️ THE PRE-MERGE BROWSER CHECK COULD NOT HAVE CAUGHT IT, WHICH IS THE REAL
  // LESSON. It asked `getBoundingClientRect()` whether the menu sat inside the
  // viewport — and a layout box reports its full size even when an ancestor is
  // visually clipping it to nothing. Measured afterwards with the bug injected
  // back in: the rect was IDENTICAL at 264x475 in both states, while
  // `document.elementFromPoint` went from 5/5 sample points hitting the menu to
  // 0/5. Measure visibility, not geometry.
  //
  // jsdom has no layout at all, so this pins the STRUCTURAL property that makes
  // the clip impossible: the panel is not inside the header.
  it('portals the panel out of the masthead, which clips its overflow', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

    await openViewAs(user)

    const menu = screen.getByTestId('view-as-menu')
    const header = document.querySelector('header')
    expect(header).toBeTruthy()
    expect(header.contains(menu)).toBe(false)
    // The portal root is the account panel, and THAT is a child of <body>.
    expect(screen.getByTestId('account-menu').parentElement).toBe(document.body)
  })

  it('offers All age groups first, then a Coach and a Parent entry per team', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

    await openViewAs(user)

    const menu = screen.getByTestId('view-as-menu')
    // ⚠️ THE ACCESSIBLE NAME, NOT THE VISIBLE TEXT. The rows read "Coach" and
    // "Parent" under a squad heading; without the aria-label a screen reader
    // gets fifteen buttons all called "Coach". That is what this asserts.
    // `Back` is the first row of the page and is not a persona.
    const options = Array.from(menu.querySelectorAll('button')).slice(1).map(
      (button) => button.getAttribute('aria-label') ?? button.textContent.replace('Current', '').trim(),
    )

    expect(options).toEqual([
      'All age groups (Admin)',
      'Coach of U12 Boys',
      'Parent in U12 Boys',
      'Coach of U14 Girls',
      'Parent in U14 Girls',
    ])
  })

  it('picking a coach persona sets viewAs with that role and team, and closes the menu', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

    await openViewAs(user)
    await user.click(screen.getByRole('menuitem', { name: 'Coach of U14 Girls' }))

    expect(setViewAsMock).toHaveBeenCalledWith({ role: 'coach', teamId: 't2' })
    expect(screen.queryByTestId('view-as-menu')).not.toBeInTheDocument()
  })

  it('picking a parent persona sets the parent role', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

    await openViewAs(user)
    await user.click(screen.getByRole('menuitem', { name: 'Parent in U12 Boys' }))

    expect(setViewAsMock).toHaveBeenCalledWith({ role: 'parent', teamId: 't1' })
  })

  it('All age groups (Admin) exits the preview', async () => {
    const user = userEvent.setup()
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    await openViewAs(user)
    await user.click(screen.getByRole('menuitem', { name: /All age groups \(Admin\)/ }))

    expect(setViewAsMock).toHaveBeenCalledWith(null)
  })

  it('still lists every team while previewing — the list is built from the real set', async () => {
    // Regression guard: built from the EFFECTIVE set, this list would collapse
    // to the single previewed team and the admin could only ever hop between
    // coach and parent of that one age group.
    const user = userEvent.setup()
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    await openViewAs(user)

    expect(screen.getByRole('menuitem', { name: 'Coach of U14 Girls' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Parent in U14 Girls' })).toBeInTheDocument()
  })

  it('closes on Escape and gives focus back to the trigger', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

    await openViewAs(user)
    expect(screen.getByTestId('view-as-menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByTestId('view-as-menu')).not.toBeInTheDocument()
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument()
    // ⚠️ Without the focus return, Escape drops the caret to <body> and a
    // keyboard user restarts from the top of the document every time they
    // change their mind. Focus goes to the ACCOUNT trigger — the View as row
    // is gone with the menu.
    expect(screen.getByTestId('account-button')).toHaveFocus()
  })

  it('closes when the pointer goes down outside it', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

    await openViewAs(user)
    expect(screen.getByTestId('view-as-menu')).toBeInTheDocument()

    await user.click(document.body)

    expect(screen.queryByTestId('view-as-menu')).not.toBeInTheDocument()
  })

  // ⚠️ THE INJECTED FAULT FOR THE TEST ABOVE. The outside-click handler tests
  // the WRAPPER, which holds the trigger and the panel. Testing the panel alone
  // would count a click on the trigger as "outside" — closing and instantly
  // reopening, which reads as the menu refusing to shut.
  it('the trigger still toggles closed rather than double-firing', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

    const trigger = screen.getByTestId('account-button')
    await user.click(trigger)
    await user.click(trigger)

    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument()
  })
})

// The Admin screen gates on the EFFECTIVE set, so the moment a preview starts
// the admin is no longer an admin as far as it is concerned — and the control
// they just used lives on it. These hold the branch that stops that being a
// dead end.
describe('/admin while previewing', () => {
  it('keeps the switcher reachable instead of saying "Not authorised"', async () => {
    const user = userEvent.setup()
    renderAdmin(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    await user.click(screen.getByTestId('account-button'))
    expect(screen.getByTestId('view-as-trigger')).toBeInTheDocument()
    expect(screen.queryByText(/not authorised/i)).not.toBeInTheDocument()
    expect(screen.getByText(/previewing the app/i)).toBeInTheDocument()
  })

  // ⚠️ THE INJECTED FAULT FOR THE TEST ABOVE, and the one that matters: the
  // branch keys off realMemberships, so a genuine coach who types /admin must
  // still be refused. If this ever goes green-to-red together with the test
  // above, the branch has been rewritten to trust the effective set or the
  // `viewAs` flag alone, and it has become a hole in the gate.
  it('still refuses a real coach who typed the URL, preview flag or not', async () => {
    const user = userEvent.setup()
    renderAdmin(
      ctx({
        realMemberships: [{ id: 'm9', role: 'coach', team_id: 't1' }],
        memberships: [{ id: 'm9', role: 'coach', team_id: 't1' }],
        viewAs: { role: 'coach', teamId: 't1' },
      }),
    )

    expect(screen.getByText(/not authorised/i)).toBeInTheDocument()
    await user.click(screen.getByTestId('account-button'))
    expect(screen.queryByTestId('view-as-trigger')).not.toBeInTheDocument()
    expect(screen.queryByText(/previewing the app/i)).not.toBeInTheDocument()
  })

  it('shows no club data on that branch — only the control', () => {
    renderAdmin(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    // The tabs are the entry point to every table on this screen.
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Club' })).not.toBeInTheDocument()
  })
})

describe('ViewAsBanner', () => {
  it('is absent when no preview is active', () => {
    renderShell(ctx())

    expect(screen.queryByTestId('view-as-banner')).not.toBeInTheDocument()
  })

  it('states the persona and that the filtering is browser-only', () => {
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    expect(screen.getByTestId('view-as-banner')).toHaveTextContent(
      'Preview — viewing as Coach, U12 Boys. Data shown is filtered in your browser only.',
    )
  })

  it('never implies a real permission change', () => {
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    const text = screen.getByTestId('view-as-banner').textContent
    expect(text).not.toMatch(/restricted/i)
    expect(text).not.toMatch(/permission/i)
  })

  it('uses the dark club red token and is visible at every width', () => {
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    const banner = screen.getByTestId('view-as-banner')
    expect(hasClassToken(banner, 'bg-brand-deep')).toBe(true)
    expect(hasClassToken(banner, 'text-white')).toBe(true)
    // The banner is the only way out of a preview, so unlike the trigger it
    // must never be CSS-hidden on mobile.
    expect(hasClassToken(banner, 'hidden')).toBe(false)
  })

  it('Exit preview clears the preview', async () => {
    const user = userEvent.setup()
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    await user.click(screen.getByRole('button', { name: 'Exit preview' }))

    expect(setViewAsMock).toHaveBeenCalledWith(null)
  })

  it('falls back to a readable label if the previewed team is not in the loaded list', () => {
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 'gone' }, memberships: synthetic('coach', 'gone') }))

    expect(screen.getByTestId('view-as-banner')).toHaveTextContent('Unknown age group')
  })

  it('is not rendered for a non-admin even if a viewAs value somehow reaches the UI', () => {
    renderShell(
      ctx({
        realMemberships: [{ id: 'm9', role: 'coach', team_id: 't1' }],
        memberships: synthetic('parent', 't1'),
        viewAs: { role: 'parent', teamId: 't1' },
      }),
    )

    expect(screen.queryByTestId('view-as-banner')).not.toBeInTheDocument()
  })
})

describe('anti-soft-lock: previewing as a parent', () => {
  // The single highest-risk requirement in the plan. While previewing as a
  // parent, isAdmin(memberships) is FALSE. Every control that gets the admin
  // back out must still be on screen.
  const previewingAsParent = () =>
    ctx({
      realMemberships: ADMIN_ROWS,
      memberships: synthetic('parent', 't1'),
      viewAs: { role: 'parent', teamId: 't1' },
    })

  it('keeps the banner on screen', () => {
    renderShell(previewingAsParent())

    expect(screen.getByTestId('view-as-banner')).toHaveTextContent(
      'Preview — viewing as Parent, U12 Boys. Data shown is filtered in your browser only.',
    )
  })

  it('keeps the Exit preview button on screen and working', async () => {
    const user = userEvent.setup()
    renderShell(previewingAsParent())

    const exit = screen.getByRole('button', { name: 'Exit preview' })
    await user.click(exit)

    expect(setViewAsMock).toHaveBeenCalledWith(null)
  })

  // ⚠️ REPOINTED TWICE, AND STRENGTHENED BOTH TIMES. On 7 Aug the trigger moved
  // out of the masthead onto /admin, so this rendered /admin and the requirement
  // hung entirely on AdminDashboard's PREVIEWING branch. Since 14 Aug the
  // trigger is in the shell, so this renders an ORDINARY screen: the admin gets
  // out from wherever they happen to be standing, not just from the one screen
  // the preview has taken away from them.
  //
  // The requirement is unchanged and is still the highest-risk one in the plan:
  // while previewing as a parent, isAdmin(memberships) is FALSE, and every gate
  // in ViewAsSwitcher reads realMemberships instead. If any of them is ever
  // switched to the effective set, this goes red.
  it('keeps the switcher trigger on screen on ANY screen, with every team still selectable', async () => {
    const user = userEvent.setup()
    renderShell(previewingAsParent())

    await openViewAs(user)

    expect(screen.getByRole('menuitem', { name: /All age groups \(Admin\)/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Coach of U14 Girls' })).toBeInTheDocument()
  })

  it('the effective set really is the parent one — the shell shows the parent role label', () => {
    renderShell(previewingAsParent())

    expect(screen.getByTestId('role-label-desktop')).toHaveTextContent('Parent')
  })
})

describe('effective vs real scoping', () => {
  // The whole value of this test is seeing the two scopes side by side in a
  // SINGLE render — the screen narrowed to the previewed team, the switcher
  // still holding all of them. Splitting it into two renders would lose that.
  //
  // ⚠️ AdminDashboard USED TO BE MOUNTED HERE PURELY TO REACH THE TRIGGER
  // (7 Aug). It is gone because the trigger is in the shell now, which makes
  // this a cleaner test of the actual claim rather than a tour of one screen.
  it('a child screen sees only the previewed team, while the switcher still sees all', async () => {
    const user = userEvent.setup()
    renderShell(
      ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }),
    )

    expect(screen.getByTestId('scoped-teams')).toHaveTextContent('U12 Boys')
    expect(screen.getByTestId('scoped-teams')).not.toHaveTextContent('U14 Girls')

    await openViewAs(user)
    expect(screen.getByRole('menuitem', { name: 'Coach of U14 Girls' })).toBeInTheDocument()
  })

  it('with no preview, a child screen sees every team', () => {
    renderShell(ctx())

    expect(screen.getByTestId('scoped-teams')).toHaveTextContent('U12 Boys, U14 Girls')
  })
})
