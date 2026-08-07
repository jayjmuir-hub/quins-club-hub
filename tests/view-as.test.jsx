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

const ADMIN_ROWS = [{ id: 'm1', role: 'admin', team_id: null, club_id: 'c1' }]

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

describe('ViewAsSwitcher trigger', () => {
  it('renders for a real admin', () => {
    renderAdmin(ctx())

    expect(screen.getByTestId('view-as-trigger')).toHaveTextContent('View as')
  })

  // ⚠️ THE REGRESSION THIS FILE NOW EXISTS TO HOLD (7 Aug 2026).
  //
  // The switcher used to sit in the masthead. An admin's masthead row —
  // crest 46 | wordmark | role pill 75 | account 77 | View-as 84 | nav 492 —
  // does not fit inside its max-w-[1120px] cap, and the wordmark is the only
  // item in that row without shrink-0, so it absorbed the whole overflow and
  // rendered "ABU DHABI HARLE…". A wider screen cannot fix that, because the
  // row is capped.
  //
  // Putting ANY new control back into the masthead re-breaks it. This asserts
  // the switcher specifically is not there.
  it('is NOT in the masthead — that is what truncated the club wordmark', () => {
    renderShell(ctx())

    const masthead = document.querySelector('header')
    expect(masthead).toBeTruthy()
    expect(masthead.querySelector('[data-testid="view-as-trigger"]')).toBeNull()
    // ...and on a screen that is not /admin it is absent entirely, rather
    // than merely relocated within the shell.
    expect(screen.queryByTestId('view-as-trigger')).not.toBeInTheDocument()
  })

  // The way OUT of a preview must not have moved with the way in. The banner
  // is what carries Exit, it renders at every width, and it is still in the
  // shell — so an admin who previews as a parent (losing /admin along with
  // it) is never stranded.
  it('leaves the Exit route in the shell, not on the screen it moved to', () => {
    renderShell(ctx({ viewAs: { role: 'parent', teamId: 't1' }, memberships: synthetic('parent', 't1') }))

    const banner = screen.getByTestId('view-as-banner')
    expect(banner).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: /exit preview/i })).toBeInTheDocument()
  })

  it('is not rendered at all for a coach', () => {
    renderAdmin(ctx({ realMemberships: [{ id: 'm9', role: 'coach', team_id: 't1' }] }))

    expect(screen.queryByTestId('view-as-trigger')).not.toBeInTheDocument()
  })

  it('is not rendered at all for a parent', () => {
    renderAdmin(
      ctx({ realMemberships: [{ id: 'm9', role: 'parent', team_id: 't1', player_id: 'p1' }] }),
    )

    expect(screen.queryByTestId('view-as-trigger')).not.toBeInTheDocument()
  })

  it('is desktop-only: hidden below the 820px breakpoint, shown at and above it', () => {
    renderAdmin(ctx())

    const trigger = screen.getByTestId('view-as-trigger')
    expect(hasClassToken(trigger, 'hidden')).toBe(true)
    // `desktop:block`, not `desktop:flex` — truncate needs a block box, and a
    // flex container ignores text-overflow on its children.
    expect(hasClassToken(trigger, 'desktop:block')).toBe(true)
  })

  // ⚠️ It sits on a LIGHT surface now, not the dark chrome. The masthead
  // version was bg-white/10 + text-white, which on the Admin screen is white
  // on near-white — present in the DOM, invisible to a person. jsdom applies
  // no CSS and cannot see that, so the token is pinned instead.
  it('is styled for the light Admin surface, not the dark masthead', () => {
    renderAdmin(ctx())

    const trigger = screen.getByTestId('view-as-trigger')
    expect(hasClassToken(trigger, 'bg-surface-card')).toBe(true)
    expect(hasClassToken(trigger, 'text-brand')).toBe(true)
    expect(hasClassToken(trigger, 'text-white')).toBe(false)
    expect(hasClassToken(trigger, 'bg-white/10')).toBe(false)
  })

  it('names the current persona once a preview is active', () => {
    renderAdmin(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    // The VISIBLE text is the persona alone; the banner above states it in
    // full, so the button does not repeat "Viewing as".
    expect(screen.getByTestId('view-as-trigger')).toHaveTextContent('Coach, U12 Boys')
  })

  // The injected fault for the test above: dropping the prefix from the
  // visible label must NOT drop it from the accessible name, or the control
  // is announced as the bare string "Coach, U12 Boys" with nothing saying it
  // is a preview or that activating it changes one.
  it('keeps the full sentence in the accessible name', () => {
    renderAdmin(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    const trigger = screen.getByTestId('view-as-trigger')
    expect(trigger).toHaveAccessibleName(/currently viewing as Coach, U12 Boys/i)
    expect(trigger).toHaveAttribute('title', expect.stringMatching(/viewing as/i))
  })

  // Not load-bearing for the wordmark any more, but still worth holding: an
  // unbounded "Coach, Senior Men 2nd XV" reflows the Admin header row every
  // time the persona changes.
  it('bounds its own width', () => {
    renderAdmin(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    const trigger = screen.getByTestId('view-as-trigger')
    expect(hasClassToken(trigger, 'max-w-[16ch]')).toBe(true)
    expect(hasClassToken(trigger, 'truncate')).toBe(true)
    // shrink-0 as well: the cap bounds the maximum, this stops flexbox
    // squeezing it to nothing on a narrow desktop and reflowing the row.
    expect(hasClassToken(trigger, 'shrink-0')).toBe(true)
  })
})

// These drive the sheet, so they render the screen the trigger now lives on.
// The two that start with a preview already active go through the Admin
// screen's PREVIEWING branch — which is exactly the path that exists so an
// admin can change persona without exiting first, and this is what holds it.
describe('ViewAsSwitcher sheet', () => {
  it('offers All age groups first, then a Coach and a Parent entry per team', async () => {
    const user = userEvent.setup()
    renderAdmin(ctx())

    await user.click(screen.getByTestId('view-as-trigger'))

    const dialog = screen.getByRole('dialog')
    const options = Array.from(dialog.querySelectorAll('button'))
      .map((button) => button.textContent.replace('Current', '').trim())
      .filter((label) => label.length > 0)

    expect(options).toEqual([
      'All age groups (Admin)',
      'Coach of U12 Boys',
      'Parent in U12 Boys',
      'Coach of U14 Girls',
      'Parent in U14 Girls',
    ])
  })

  it('picking a coach persona sets viewAs with that role and team, and closes the sheet', async () => {
    const user = userEvent.setup()
    renderAdmin(ctx())

    await user.click(screen.getByTestId('view-as-trigger'))
    await user.click(screen.getByRole('button', { name: 'Coach of U14 Girls' }))

    expect(setViewAsMock).toHaveBeenCalledWith({ role: 'coach', teamId: 't2' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('picking a parent persona sets the parent role', async () => {
    const user = userEvent.setup()
    renderAdmin(ctx())

    await user.click(screen.getByTestId('view-as-trigger'))
    await user.click(screen.getByRole('button', { name: 'Parent in U12 Boys' }))

    expect(setViewAsMock).toHaveBeenCalledWith({ role: 'parent', teamId: 't1' })
  })

  it('All age groups (Admin) exits the preview', async () => {
    const user = userEvent.setup()
    renderAdmin(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    await user.click(screen.getByTestId('view-as-trigger'))
    await user.click(screen.getByRole('button', { name: /All age groups \(Admin\)/ }))

    expect(setViewAsMock).toHaveBeenCalledWith(null)
  })

  it('still lists every team while previewing — the list is built from the real set', async () => {
    // Regression guard: built from the EFFECTIVE set, this list would
    // collapse to the single previewed team and the admin could only ever
    // hop between coach and parent of that one age group.
    const user = userEvent.setup()
    renderAdmin(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    await user.click(screen.getByTestId('view-as-trigger'))

    expect(screen.getByRole('button', { name: 'Coach of U14 Girls' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parent in U14 Girls' })).toBeInTheDocument()
  })
})

// The Admin screen gates on the EFFECTIVE set, so the moment a preview starts
// the admin is no longer an admin as far as it is concerned — and the control
// they just used lives on it. These hold the branch that stops that being a
// dead end.
describe('/admin while previewing', () => {
  it('keeps the switcher reachable instead of saying "Not authorised"', () => {
    renderAdmin(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    expect(screen.getByTestId('view-as-trigger')).toBeInTheDocument()
    expect(screen.queryByText(/not authorised/i)).not.toBeInTheDocument()
    expect(screen.getByText(/previewing the app/i)).toBeInTheDocument()
  })

  // ⚠️ THE INJECTED FAULT FOR THE TEST ABOVE, and the one that matters: the
  // branch keys off realMemberships, so a genuine coach who types /admin must
  // still be refused. If this ever goes green-to-red together with the test
  // above, the branch has been rewritten to trust the effective set or the
  // `viewAs` flag alone, and it has become a hole in the gate.
  it('still refuses a real coach who typed the URL, preview flag or not', () => {
    renderAdmin(
      ctx({
        realMemberships: [{ id: 'm9', role: 'coach', team_id: 't1' }],
        memberships: [{ id: 'm9', role: 'coach', team_id: 't1' }],
        viewAs: { role: 'coach', teamId: 't1' },
      }),
    )

    expect(screen.getByText(/not authorised/i)).toBeInTheDocument()
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

  // ⚠️ REPOINTED, NOT RELAXED (7 Aug 2026). The trigger moved out of the
  // masthead onto /admin, so this now renders /admin — but the requirement is
  // unchanged and still the highest-risk one in the plan: an admin previewing
  // as a parent is NOT an admin by the effective set, and the control that
  // gets them back must still be reachable.
  //
  // Reaching it depends entirely on AdminDashboard's PREVIEWING branch. If
  // that branch is ever removed, this goes red — which is the point. The
  // banner's Exit is tested separately as the always-available second route,
  // so the two are not one anchor wearing two hats.
  it('keeps the switcher trigger on screen, with every team still selectable', async () => {
    const user = userEvent.setup()
    renderAdmin(previewingAsParent())

    await user.click(screen.getByTestId('view-as-trigger'))

    expect(screen.getByRole('button', { name: /All age groups \(Admin\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coach of U14 Girls' })).toBeInTheDocument()
  })

  it('the effective set really is the parent one — the shell shows the parent role label', () => {
    renderShell(previewingAsParent())

    expect(screen.getByTestId('role-label-desktop')).toHaveTextContent('Parent')
  })
})

describe('effective vs real scoping', () => {
  // Renders BOTH children in one tree on purpose: the whole value of this
  // test is seeing the two scopes side by side in a single render — the
  // screen narrowed to the previewed team, the switcher still holding all of
  // them. Splitting it into two renders would lose exactly that.
  // (AdminDashboard is here because the switcher moved onto it, 7 Aug 2026.)
  it('a child screen sees only the previewed team, while the switcher still sees all', async () => {
    const user = userEvent.setup()
    renderShell(
      ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }),
      <>
        <ScopedChild />
        <AdminDashboard />
      </>,
    )

    expect(screen.getByTestId('scoped-teams')).toHaveTextContent('U12 Boys')
    expect(screen.getByTestId('scoped-teams')).not.toHaveTextContent('U14 Girls')

    await user.click(screen.getByTestId('view-as-trigger'))
    expect(screen.getByRole('button', { name: 'Coach of U14 Girls' })).toBeInTheDocument()
  })

  it('with no preview, a child screen sees every team', () => {
    renderShell(ctx())

    expect(screen.getByTestId('scoped-teams')).toHaveTextContent('U12 Boys, U14 Girls')
  })
})
