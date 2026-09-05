import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The masthead's account menu — 23 Aug 2026. The View-as page of it is held
// by tests/view-as.test.jsx and the trigger's naming by tests/app-shell.test.jsx;
// this file holds the rest: the header line, the theme row, sign-out, and the
// close behaviours that ViewAsSwitcher used to hold for its own panel.

const useMembershipsMock = vi.fn()
vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

import AccountMenu from '../src/components/AccountMenu.jsx'
import { setTheme, effectiveTheme } from '../src/lib/theme.js'

const ADMIN = [{ id: 'm1', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null, club_id: 'c1' }]
const PARENT = [{ id: 'm2', role: 'parent', status: 'active', team_id: 't1', player_id: 'p1' }]

function ctx(realMemberships = PARENT, extra = {}) {
  return { memberships: realMemberships, realMemberships, viewAs: null, setViewAs: vi.fn(), teams: [], ...extra }
}

function renderMenu(props = {}, memberships = PARENT) {
  useMembershipsMock.mockReturnValue(ctx(memberships))
  const signOut = props.signOut ?? vi.fn().mockResolvedValue(undefined)
  render(
    <MemoryRouter>
      <button type="button">elsewhere</button>
      <AccountMenu firstName="Jay" email="jay@example.com" roleLabel="Parent" signOut={signOut} {...props} />
    </MemoryRouter>,
  )
  return { signOut }
}

beforeEach(() => {
  useMembershipsMock.mockReset()
  setTheme('light')
})

describe('AccountMenu', () => {
  // Chrome-quarters follow-up (31 Aug 2026, Jay: "the little arrow beside
  // the profile initial is really hard to see when in light mode"). The
  // trigger sits ON the dark chrome, so its chevron must be white-family
  // like the rest of the masthead — text-ink is near-black in light mode
  // and vanished. The dropdown SHEET keeps ink: it opens on a card.
  it('the trigger and its chevron are white on the chrome, never ink', () => {
    renderMenu()
    const trigger = screen.getByTestId('account-button')
    expect(trigger.className).toContain('text-white/90')
    expect(trigger.className).not.toContain('text-ink')
    const chevron = trigger.querySelector('svg')
    expect(chevron.getAttribute('class')).toContain('text-white/70')
    expect(chevron.getAttribute('class')).not.toContain('text-ink')
  })

  it('says who this is, in full, as the first line', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByTestId('account-button'))
    expect(screen.getByTestId('account-menu-name')).toHaveTextContent('Jay')
    expect(screen.getByText('Parent')).toBeInTheDocument()
  })

  it('falls back to the email when there is no name, and never to an empty initial', async () => {
    const user = userEvent.setup()
    renderMenu({ firstName: null })

    expect(screen.getByTestId('account-button').textContent).toBe('J')
    await user.click(screen.getByTestId('account-button'))
    expect(screen.getByTestId('account-menu-name')).toHaveTextContent('jay@example.com')
  })

  it('offers Settings, Dark mode and Sign out — and no View as — to a parent', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByTestId('account-button'))
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Dark mode' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByTestId('view-as-trigger')).not.toBeInTheDocument()
  })

  // ⚠️ The floating `?` retired 24 Aug 2026 lives here now — see
  // claude/plans/2026-08-24-help-into-account-menu.md. The sheet itself is
  // AppShell's; this row only asks for it, then gets out of the way.
  it('Report a problem closes the menu and asks AppShell to open the help sheet', async () => {
    const user = userEvent.setup()
    const onReportProblem = vi.fn()
    renderMenu({ onReportProblem })

    await user.click(screen.getByTestId('account-button'))
    await user.click(screen.getByRole('menuitem', { name: 'Report a problem' }))

    expect(onReportProblem).toHaveBeenCalledTimes(1)
    // The menu must be gone: the sheet is taking the screen, and a menu left
    // open underneath it would still be there when the sheet closes.
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument()
  })

  it('offers View as to a real admin', async () => {
    const user = userEvent.setup()
    renderMenu({}, ADMIN)

    await user.click(screen.getByTestId('account-button'))
    expect(screen.getByTestId('view-as-trigger')).toBeInTheDocument()
  })

  // ⚠️ The theme switch that used to be its own 32px masthead button. The row
  // is a menuitemcheckbox so its state is in the accessibility tree, not only
  // in the drawn switch.
  it('the Dark mode row toggles the theme and reports its state', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByTestId('account-button'))
    const row = screen.getByRole('menuitemcheckbox', { name: 'Dark mode' })
    expect(row).toHaveAttribute('aria-checked', 'false')

    await user.click(row)

    expect(effectiveTheme()).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(row).toHaveAttribute('aria-checked', 'true')
    // Toggling does not close the menu — somebody flipping back and forth to
    // compare should not have to reopen it each time.
    expect(screen.getByTestId('account-menu')).toBeInTheDocument()
  })

  it('Sign out calls signOut', async () => {
    const user = userEvent.setup()
    const { signOut } = renderMenu()

    await user.click(screen.getByTestId('account-button'))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('a failed sign-out is shown inline, and the row is usable again', async () => {
    const user = userEvent.setup()
    renderMenu({ signOut: vi.fn().mockRejectedValue(new Error('network down')) })

    await user.click(screen.getByTestId('account-button'))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).not.toBeDisabled()
  })

  it('closes on Escape and returns focus to the initial', async () => {
    const user = userEvent.setup()
    renderMenu()

    const trigger = screen.getByTestId('account-button')
    await user.click(trigger)
    expect(screen.getByTestId('account-menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes when the pointer goes down outside it', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByTestId('account-button'))
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument()
  })

  it('choosing Settings closes the menu', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByTestId('account-button'))
    await user.click(screen.getByRole('menuitem', { name: 'Settings' }))
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument()
  })

  // ⚠️ The portal: the masthead row clips its overflow, and a panel inside it
  // rendered as a 6px sliver once (14 Aug 2026). The panel must be a child of
  // <body>, not of whatever the trigger sits in.
  it('portals the panel to <body>', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByTestId('account-button'))
    expect(screen.getByTestId('account-menu').parentElement).toBe(document.body)
  })
})

// ── The management doors (moved here from the More tab, 29 Aug 2026) ──────────
//
// ⚠️ THIS IS A COACH'S ONLY ROUTE TO THE APPROVALS QUEUE FROM A PHONE now that
// the More tab is gone — the desktop Sidebar's Admin item is admin-only and
// desktop-only. The gating is canApproveAnything (status- AND role-aware), the
// same it was on the More page; these tests carry the edge cases over with it.
describe('AccountMenu — the management doors', () => {
  const COACH_U10 = [{ id: 'm-c', role: 'coach', team_id: 'team-u10', club_id: 'c1', status: 'active' }]
  const MANAGER_U10 = [{ id: 'm-m', role: 'manager', team_id: 'team-u10', club_id: 'c1', status: 'active' }]
  const MEDIC_U10 = [{ id: 'm-md', role: 'medic', team_id: 'team-u10', club_id: 'c1', status: 'active' }]
  // The row request_staff_role actually creates: coach, no player, PENDING.
  const PENDING_COACH = [
    { id: 'm-pc', role: 'coach', team_id: 'team-u10', club_id: 'c1', player_id: null, status: 'pending' },
  ]

  async function open(memberships) {
    renderMenu({}, memberships)
    await userEvent.setup().click(screen.getByTestId('account-button'))
  }

  it('gives an admin the Admin door and not Approvals', async () => {
    await open(ADMIN)
    expect(screen.getByTestId('account-admin')).toHaveAttribute('href', '/admin')
    expect(screen.queryByTestId('account-approvals')).not.toBeInTheDocument()
  })

  it('gives a coach the Approvals door and not Admin', async () => {
    await open(COACH_U10)
    expect(screen.getByTestId('account-approvals')).toHaveAttribute('href', '/approvals')
    expect(screen.queryByTestId('account-admin')).not.toBeInTheDocument()
  })

  it('gives a team manager the Approvals door', async () => {
    await open(MANAGER_U10)
    expect(screen.getByTestId('account-approvals')).toHaveAttribute('href', '/approvals')
  })

  // Medic may EDIT a squad's players but is deliberately off the approvals list.
  it('gives a medic neither door', async () => {
    await open(MEDIC_U10)
    expect(screen.queryByTestId('account-approvals')).not.toBeInTheDocument()
    expect(screen.queryByTestId('account-admin')).not.toBeInTheDocument()
    expect(screen.queryByTestId('account-ops')).not.toBeInTheDocument()
  })

  // ⚠️ THE SAFEGUARDING CASE. A pending coach request has the same role and team
  // as an approved coach; it must NOT be handed the queue that judges it. Gated
  // by STATUS via canApproveAnything, not by role alone.
  it('gives a coach whose request is still pending neither door', async () => {
    await open(PENDING_COACH)
    expect(screen.queryByTestId('account-approvals')).not.toBeInTheDocument()
    expect(screen.queryByTestId('account-admin')).not.toBeInTheDocument()
  })

  it('gives a parent neither door', async () => {
    await open(PARENT)
    expect(screen.queryByTestId('account-approvals')).not.toBeInTheDocument()
    expect(screen.queryByTestId('account-admin')).not.toBeInTheDocument()
    expect(screen.queryByTestId('account-ops')).not.toBeInTheDocument()
  })

  it('gives a super admin the Ops door', async () => {
    await open([{ id: 'm-sa', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null, club_id: 'c1', is_super: true }])
    expect(screen.getByTestId('account-ops')).toHaveAttribute('href', '/ops')
  })

  it('gives a head coach the Ops door, not an assistant', async () => {
    await open([{ id: 'm-hc', role: 'coach', team_id: 'team-u10', club_id: 'c1', status: 'active', is_head_coach: true }])
    expect(screen.getByTestId('account-ops')).toHaveAttribute('href', '/ops')
  })
})
