import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

const countAdminWaitingMock = vi.fn()
vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}))
vi.mock('../src/data/members.js', () => ({
  countAdminWaiting: (...args) => countAdminWaitingMock(...args),
}))
const useMembershipsMock = vi.fn()
vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

import Sidebar from '../src/components/Sidebar.jsx'

beforeEach(() => {
  vi.clearAllMocks()
  countAdminWaitingMock.mockResolvedValue(0)
  useMembershipsMock.mockReturnValue({
    // `clubadmin` since 28 Aug 2026 (Phase 0a): every real admin holds it (the
    // backfill), and the Club Hub Admin portal now requires it.
    memberships: [{ id: 'm1', role: 'admin', team_id: null, club_id: 'c1', status: 'active', is_super: false, admin_rights: ['clubadmin'] }],
    teams: [],
  })
})

// The sidebar's expanding sub-menus (22 Aug 2026). The contract:
//   - only the ACTIVE section expands — elsewhere, no sub-items at all;
//   - Squad Hub's children carry the squad from the URL, and bare /squad
//     (the multi-squad picker) has no children because there is no squad yet;
//   - Schedule's children are ?open= deep-links, and "Add an event" only
//     shows for people the Squad Hub gate already admits.

function renderAt(path, props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar showSquadHub {...props} />
    </MemoryRouter>,
  )
}

describe('Squad Hub sub-menu', () => {
  it('expands with Overview and Match roster inside a squad, carrying the teamId', () => {
    renderAt('/squad/t-u12')
    const submenu = screen.getByTestId('submenu-squad')
    expect(within(submenu).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/squad/t-u12')
    expect(within(submenu).getByRole('link', { name: 'Match roster' })).toHaveAttribute(
      'href',
      '/squad/t-u12/match-roster',
    )
    expect(within(submenu).getByRole('link', { name: 'Training' })).toHaveAttribute(
      'href',
      '/squad/t-u12/training',
    )
  })

  it('stays expanded on the match-roster child route', () => {
    renderAt('/squad/t-u12/match-roster')
    expect(screen.getByTestId('submenu-squad')).toBeInTheDocument()
  })

  it('shows no children on bare /squad — no squad chosen yet', () => {
    renderAt('/squad')
    expect(screen.queryByTestId('submenu-squad')).not.toBeInTheDocument()
  })

  it('shows no children anywhere else', () => {
    renderAt('/roster')
    expect(screen.queryByTestId('submenu-squad')).not.toBeInTheDocument()
    expect(screen.queryByTestId('submenu-schedule')).not.toBeInTheDocument()
  })

  it('adds a Call-ups pill on a senior squad, not the U18 pool on Overview', () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm2', role: 'coach', status: 'active', team_id: 't-men', is_head_coach: true }],
      teams: [{ id: 't-men', name: 'Senior Men - 2nd XV', is_senior: true, sort_order: 20 }],
    })
    renderAt('/squad/t-men')
    const submenu = screen.getByTestId('submenu-squad')
    expect(within(submenu).getByRole('link', { name: 'Call-ups' })).toHaveAttribute('href', '/squad/t-men/callups')
    expect(within(submenu).queryByRole('link', { name: 'Play-ups' })).not.toBeInTheDocument()
  })

  it('adds a Play-ups pill for a junior head coach and hides it from an assistant', () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm3', role: 'coach', status: 'active', team_id: 't-u14', is_head_coach: true }],
      teams: [
        { id: 't-u13', name: 'U13 Mixed', is_senior: false, sort_order: 8 },
        { id: 't-u14', name: 'U14B', is_senior: false, sort_order: 9 },
      ],
    })
    renderAt('/squad/t-u14')
    expect(within(screen.getByTestId('submenu-squad')).getByRole('link', { name: 'Play-ups' })).toHaveAttribute(
      'href',
      '/squad/t-u14/playups',
    )

    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm4', role: 'coach', status: 'active', team_id: 't-u14', is_head_coach: false }],
      teams: [
        { id: 't-u13', name: 'U13 Mixed', is_senior: false, sort_order: 8 },
        { id: 't-u14', name: 'U14B', is_senior: false, sort_order: 9 },
      ],
    })
    renderAt('/squad/t-u14')
    const menus = screen.getAllByTestId('submenu-squad')
    expect(within(menus[menus.length - 1]).queryByRole('link', { name: 'Play-ups' })).not.toBeInTheDocument()
  })
})

describe('the Admin badge', () => {
  it('shows the waiting count on the Admin item for admins', async () => {
    countAdminWaitingMock.mockResolvedValue(3)
    renderAt('/', { showAdmin: true })
    const badge = await screen.findByTestId('admin-waiting-badge')
    expect(badge).toHaveTextContent('3')
    expect(badge).toHaveAttribute('aria-label', '3 waiting for review')
  })

  it('renders nothing at zero — a "0" pill is noise', async () => {
    countAdminWaitingMock.mockResolvedValue(0)
    renderAt('/', { showAdmin: true })
    await vi.waitFor(() => expect(countAdminWaitingMock).toHaveBeenCalled())
    expect(screen.queryByTestId('admin-waiting-badge')).not.toBeInTheDocument()
  })

  it('a failed count costs the badge, nothing else', async () => {
    countAdminWaitingMock.mockRejectedValue(new Error('nope'))
    renderAt('/', { showAdmin: true })
    await vi.waitFor(() => expect(countAdminWaitingMock).toHaveBeenCalled())
    expect(screen.queryByTestId('admin-waiting-badge')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Admin/ })).toBeInTheDocument()
  })

  it('re-counts when the admin leaves Accounts, where the queue gets cleared', async () => {
    countAdminWaitingMock.mockResolvedValueOnce(3).mockResolvedValueOnce(1)
    // A real in-router navigation — the only thing that is a "leave".
    function Leave() {
      const navigate = useNavigate()
      return <button onClick={() => navigate('/')}>go</button>
    }
    render(
      <MemoryRouter initialEntries={['/admin/accounts']}>
        <Sidebar showSquadHub showAdmin />
        <Leave />
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('admin-waiting-badge')).toHaveTextContent('3')
    await userEvent.click(screen.getByRole('button', { name: 'go' }))
    await vi.waitFor(() => expect(countAdminWaitingMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByTestId('admin-waiting-badge')).toHaveTextContent('1')
  })

  it('never even asks for non-admins', () => {
    renderAt('/', { showAdmin: false })
    expect(countAdminWaitingMock).not.toHaveBeenCalled()
  })
})

describe('Roster sub-menu', () => {
  it('expands for squad staff with the two deep-links and Game time', () => {
    renderAt('/roster')
    const submenu = screen.getByTestId('submenu-roster')
    expect(within(submenu).getByRole('link', { name: 'Add a player' })).toHaveAttribute(
      'href',
      '/roster?open=add-player',
    )
    expect(within(submenu).getByRole('link', { name: 'Import players' })).toHaveAttribute(
      'href',
      '/roster?open=import',
    )
    expect(within(submenu).getByRole('link', { name: 'Game time' })).toHaveAttribute('href', '/game-time')
  })

  it('stays expanded on /game-time — the section must not collapse under its own child', () => {
    renderAt('/game-time')
    expect(screen.getByTestId('submenu-roster')).toBeInTheDocument()
  })

  it('has no children at all for people without the staff gate', () => {
    renderAt('/roster', { showSquadHub: false })
    expect(screen.queryByTestId('submenu-roster')).not.toBeInTheDocument()
  })
})

describe('Schedule sub-menu', () => {
  it('expands on /schedule with the two deep-links for squad staff', () => {
    renderAt('/schedule')
    const submenu = screen.getByTestId('submenu-schedule')
    expect(within(submenu).getByRole('link', { name: 'Add an event' })).toHaveAttribute(
      'href',
      '/schedule?open=add-event',
    )
    expect(within(submenu).getByRole('link', { name: 'Add to calendar' })).toHaveAttribute(
      'href',
      '/schedule?open=subscribe',
    )
    expect(within(submenu).getByRole('link', { name: 'Pitch calendar' })).toHaveAttribute(
      'href',
      '/pitch-calendar',
    )
  })

  it('stays expanded on /pitch-calendar — same rule as /game-time under Roster', () => {
    renderAt('/pitch-calendar')
    expect(screen.getByTestId('submenu-schedule')).toBeInTheDocument()
  })

  it('hides Add an event and Pitch calendar from people without the Squad Hub gate', () => {
    renderAt('/schedule', { showSquadHub: false })
    const submenu = screen.getByTestId('submenu-schedule')
    expect(within(submenu).queryByRole('link', { name: 'Add an event' })).not.toBeInTheDocument()
    expect(within(submenu).queryByRole('link', { name: 'Pitch calendar' })).not.toBeInTheDocument()
    expect(within(submenu).getByRole('link', { name: 'Add to calendar' })).toBeInTheDocument()
  })
})

// The Admin sub-menu (24 Aug 2026, Jay: "the admin button in the left bar
// should expand like the others"). Its children are the portals the viewer
// can ENTER — the /admin chooser's open cards, from the same registry.
describe('Admin sub-menu', () => {
  it('expands on /admin with the portals this admin holds — an ordinary admin gets Club Hub Admin and Match sheets', () => {
    renderAt('/admin/accounts', { showAdmin: true })
    const menu = screen.getByTestId('submenu-admin')
    expect(within(menu).getByRole('link', { name: 'Club Hub Admin' })).toHaveAttribute('href', '/admin/accounts')
    expect(within(menu).queryByRole('link', { name: 'Pitch Management' })).toBeNull()
  })

  it('a super admin sees every portal that has screens — except Welfare, until it is ticked', () => {
    // ⚠️ Welfare is the deliberate exception since 30 Aug 2026 (Grok item 7):
    // can_review_dm has no super short-circuit, so an unticked super would
    // land on EMPTY welfare screens — the menu item waits for the explicit
    // grant instead of offering a door onto a bare room.
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm1', role: 'admin', team_id: null, club_id: 'c1', status: 'active', is_super: true, admin_rights: [] }],
      teams: [],
    })
    renderAt('/admin', { showAdmin: true })
    const menu = screen.getByTestId('submenu-admin')
    expect(within(menu).getByRole('link', { name: 'Pitch Management' })).toBeInTheDocument()
    expect(within(menu).queryByRole('link', { name: 'Welfare' })).toBeNull()
  })

  it('a super admin who has ticked welfare sees the Welfare portal too', () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm1', role: 'admin', team_id: null, club_id: 'c1', status: 'active', is_super: true, admin_rights: ['welfare'] }],
      teams: [],
    })
    renderAt('/admin', { showAdmin: true })
    const menu = screen.getByTestId('submenu-admin')
    expect(within(menu).getByRole('link', { name: 'Welfare' })).toBeInTheDocument()
  })

  it('stays expanded on /approvals — where the badge count lives', () => {
    renderAt('/approvals', { showAdmin: true })
    expect(screen.getByTestId('submenu-admin')).toBeInTheDocument()
  })

  it('collapsed anywhere else, like every other section', () => {
    renderAt('/schedule', { showAdmin: true })
    expect(screen.queryByTestId('submenu-admin')).toBeNull()
  })
})

describe('the Chat unread count (4 Sep 2026)', () => {
  // Jay, asked "dot or number" against the 23 Aug dot-only ruling: number.
  // The sidebar wears the same count the installed icon does; the phone dock
  // keeps its dot. Zero renders nothing, like the Admin pill.
  it('shows the count on the Chat item with a spoken label', () => {
    renderAt('/', { chatUnread: 4 })
    const badge = screen.getByTestId('chat-unread-badge')
    expect(badge).toHaveTextContent('4')
    expect(badge).toHaveAttribute('aria-label', '4 unread messages')
    expect(screen.getByRole('link', { name: /^Chat/ })).toContainElement(badge)
  })

  it('CONTROL: renders nothing at zero, and "1" is singular', () => {
    const { unmount } = renderAt('/', { chatUnread: 0 })
    expect(screen.queryByTestId('chat-unread-badge')).not.toBeInTheDocument()
    unmount()
    renderAt('/', { chatUnread: 1 })
    expect(screen.getByTestId('chat-unread-badge')).toHaveAttribute('aria-label', '1 unread message')
  })
})
