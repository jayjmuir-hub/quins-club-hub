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

import Sidebar from '../src/components/Sidebar.jsx'

beforeEach(() => {
  vi.clearAllMocks()
  countAdminWaitingMock.mockResolvedValue(0)
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
  it('expands with Overview and Build a Match Roster inside a squad, carrying the teamId', () => {
    renderAt('/squad/t-u12')
    const submenu = screen.getByTestId('submenu-squad')
    expect(within(submenu).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/squad/t-u12')
    expect(within(submenu).getByRole('link', { name: 'Build a Match Roster' })).toHaveAttribute(
      'href',
      '/squad/t-u12/match-roster',
    )
    expect(within(submenu).getByRole('link', { name: 'Training Plans' })).toHaveAttribute(
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
