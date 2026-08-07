import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

beforeEach(() => {
  useAuthMock.mockReset()
  useMembershipsMock.mockReset()
  setViewAsMock.mockReset()
  useAuthMock.mockReturnValue({ user: { email: 'jay@example.com' }, signOut: vi.fn() })
})

describe('ViewAsSwitcher trigger', () => {
  it('renders for a real admin', () => {
    renderShell(ctx())

    expect(screen.getByTestId('view-as-trigger')).toHaveTextContent('View as')
  })

  it('is not rendered at all for a coach', () => {
    renderShell(ctx({ realMemberships: [{ id: 'm9', role: 'coach', team_id: 't1' }] }))

    expect(screen.queryByTestId('view-as-trigger')).not.toBeInTheDocument()
  })

  it('is not rendered at all for a parent', () => {
    renderShell(
      ctx({ realMemberships: [{ id: 'm9', role: 'parent', team_id: 't1', player_id: 'p1' }] }),
    )

    expect(screen.queryByTestId('view-as-trigger')).not.toBeInTheDocument()
  })

  it('is desktop-only: hidden below the 820px breakpoint, shown at and above it', () => {
    renderShell(ctx())

    const trigger = screen.getByTestId('view-as-trigger')
    expect(hasClassToken(trigger, 'hidden')).toBe(true)
    // `desktop:block`, not `desktop:flex` — truncate needs a block box, and a
    // flex container ignores text-overflow on its children.
    expect(hasClassToken(trigger, 'desktop:block')).toBe(true)
  })

  it('names the current persona once a preview is active', () => {
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    // ⚠️ The VISIBLE text no longer says "Viewing as" (7 Aug 2026). That
    // prefix was pure restatement of the banner directly above it, and the
    // masthead was charging the club wordmark 202px for it — measured in the
    // harness, the wordmark got 226px of the 257 it needs and rendered
    // "ABU DHABI HARLE…". The persona itself still has to be here.
    expect(screen.getByTestId('view-as-trigger')).toHaveTextContent('Coach, U12 Boys')
  })

  // The injected fault for the test above: dropping the prefix from the
  // visible label must NOT drop it from the accessible name, or the control
  // is announced as the bare string "Coach, U12 Boys" with nothing saying it
  // is a preview or that activating it changes one.
  it('keeps the full sentence in the accessible name', () => {
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    const trigger = screen.getByTestId('view-as-trigger')
    expect(trigger).toHaveAccessibleName(/currently viewing as Coach, U12 Boys/i)
    expect(trigger).toHaveAttribute('title', expect.stringMatching(/viewing as/i))
  })

  // ⚠️ THE BOUND IS THE ACTUAL FIX, not the shortened string. "Coach, Senior
  // Men 2nd XV" is LONGER than the "Viewing as Coach, U13" it replaced, so
  // without a cap the same truncation returns for the club's longest squad
  // names. Measured in the harness at the masthead's 1120px cap: unbounded,
  // that squad took the trigger to 324px and the wordmark down to 104px;
  // bounded it is 120px and the wordmark keeps all 257.
  //
  // jsdom applies no CSS, so this pins the tokens, as the masthead breakpoint
  // and PhoneInput regressions do.
  it('bounds its own width so the club wordmark never absorbs the overflow', () => {
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    const trigger = screen.getByTestId('view-as-trigger')
    expect(hasClassToken(trigger, 'max-w-[16ch]')).toBe(true)
    expect(hasClassToken(trigger, 'truncate')).toBe(true)
    // shrink-0 as well: the cap bounds the maximum, this stops flexbox
    // squeezing it to nothing on a narrow desktop and reflowing the row.
    expect(hasClassToken(trigger, 'shrink-0')).toBe(true)
  })
})

describe('ViewAsSwitcher sheet', () => {
  it('offers All age groups first, then a Coach and a Parent entry per team', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

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
    renderShell(ctx())

    await user.click(screen.getByTestId('view-as-trigger'))
    await user.click(screen.getByRole('button', { name: 'Coach of U14 Girls' }))

    expect(setViewAsMock).toHaveBeenCalledWith({ role: 'coach', teamId: 't2' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('picking a parent persona sets the parent role', async () => {
    const user = userEvent.setup()
    renderShell(ctx())

    await user.click(screen.getByTestId('view-as-trigger'))
    await user.click(screen.getByRole('button', { name: 'Parent in U12 Boys' }))

    expect(setViewAsMock).toHaveBeenCalledWith({ role: 'parent', teamId: 't1' })
  })

  it('All age groups (Admin) exits the preview', async () => {
    const user = userEvent.setup()
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    await user.click(screen.getByTestId('view-as-trigger'))
    await user.click(screen.getByRole('button', { name: /All age groups \(Admin\)/ }))

    expect(setViewAsMock).toHaveBeenCalledWith(null)
  })

  it('still lists every team while previewing — the list is built from the real set', async () => {
    // Regression guard: built from the EFFECTIVE set, this list would
    // collapse to the single previewed team and the admin could only ever
    // hop between coach and parent of that one age group.
    const user = userEvent.setup()
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

    await user.click(screen.getByTestId('view-as-trigger'))

    expect(screen.getByRole('button', { name: 'Coach of U14 Girls' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parent in U14 Girls' })).toBeInTheDocument()
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

  it('keeps the switcher trigger on screen, with every team still selectable', async () => {
    const user = userEvent.setup()
    renderShell(previewingAsParent())

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
  it('a child screen sees only the previewed team, while the switcher still sees all', async () => {
    const user = userEvent.setup()
    renderShell(ctx({ viewAs: { role: 'coach', teamId: 't1' }, memberships: synthetic('coach', 't1') }))

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
