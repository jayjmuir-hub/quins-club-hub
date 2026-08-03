import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/lib/memberships.jsx (Task 8: MembershipProvider /
// useMemberships). scope.js (Task 7) stays pure and provider-free by design;
// this is the provider that decision requires. Both useAuth and the Supabase
// client are mocked so this never touches the network and exercises only
// this file's loading/error/reload/cleanup wiring.

const useAuthMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

// Import after vi.mock so these bind to the mocked modules.
import { supabase } from '../src/lib/supabase.js'
import { MembershipProvider, useMemberships } from '../src/lib/memberships.jsx'

const MEMBERSHIP_ROW = { id: 'm-1', role: 'coach', team_id: 'team-1', player_id: null }
const ADMIN_ROW = {
  id: 'm-admin',
  role: 'admin',
  team_id: null,
  player_id: null,
  club_id: 'club-ad',
}
const TEAM_ROW = { id: 'team-1', name: 'U12', sort_order: 7 }

function Harness() {
  const { memberships, teams, loading, error, reload } = useMemberships()
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="error">{error ? error.message : 'none'}</div>
      <div data-testid="memberships">{JSON.stringify(memberships)}</div>
      <div data-testid="teams">{JSON.stringify(teams)}</div>
      <button onClick={reload}>Reload</button>
    </div>
  )
}

function mockFrom({ memberships, membershipsError, teams, teamsError } = {}) {
  supabase.from.mockImplementation((table) => {
    if (table === 'memberships') {
      return {
        select: vi.fn().mockResolvedValue({
          data: membershipsError ? null : (memberships ?? [MEMBERSHIP_ROW]),
          error: membershipsError ?? null,
        }),
      }
    }
    if (table === 'teams') {
      return {
        select: vi.fn().mockResolvedValue({
          data: teamsError ? null : (teams ?? [TEAM_ROW]),
          error: teamsError ?? null,
        }),
      }
    }
    throw new Error(`Unexpected table in test: ${table}`)
  })
}

// Second harness for the "view as" preview (design spec 2026-08-03 §1): it
// exposes the effective set, the real set, and buttons that drive setViewAs.
function ViewAsHarness() {
  const { memberships, realMemberships, viewAs, setViewAs, loading } = useMemberships()
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="memberships">{JSON.stringify(memberships)}</div>
      <div data-testid="real">{JSON.stringify(realMemberships)}</div>
      <div data-testid="viewAs">{JSON.stringify(viewAs)}</div>
      <button onClick={() => setViewAs({ role: 'parent', teamId: 'team-1' })}>Preview</button>
      <button onClick={() => setViewAs(null)}>Exit</button>
    </div>
  )
}

beforeEach(() => {
  useAuthMock.mockReset()
  supabase.from.mockReset()
  window.localStorage.clear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('MembershipProvider / useMemberships', () => {
  it('does not query at all with no session, and resolves loading to false immediately with empty arrays', () => {
    useAuthMock.mockReturnValue({ session: null })

    render(
      <MembershipProvider>
        <Harness />
      </MembershipProvider>,
    )

    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('memberships')).toHaveTextContent('[]')
    expect(screen.getByTestId('teams')).toHaveTextContent('[]')
    expect(screen.getByTestId('error')).toHaveTextContent('none')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('starts loading true, then loads memberships and teams once a session exists', async () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'u1' } } })
    mockFrom()

    render(
      <MembershipProvider>
        <Harness />
      </MembershipProvider>,
    )

    expect(screen.getByTestId('loading')).toHaveTextContent('true')

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    expect(screen.getByTestId('memberships')).toHaveTextContent('coach')
    expect(screen.getByTestId('teams')).toHaveTextContent('U12')
    expect(screen.getByTestId('error')).toHaveTextContent('none')
    expect(supabase.from).toHaveBeenCalledWith('memberships')
    expect(supabase.from).toHaveBeenCalledWith('teams')
  })

  it('resolves loading to false and sets error when the memberships query fails', async () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'u1' } } })
    mockFrom({ membershipsError: new Error('permission denied') })

    render(
      <MembershipProvider>
        <Harness />
      </MembershipProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    expect(screen.getByTestId('error')).toHaveTextContent('permission denied')
    expect(screen.getByTestId('memberships')).toHaveTextContent('[]')
  })

  it('resolves loading to false and sets error when the teams query fails', async () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'u1' } } })
    mockFrom({ teamsError: new Error('teams unavailable') })

    render(
      <MembershipProvider>
        <Harness />
      </MembershipProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    expect(screen.getByTestId('error')).toHaveTextContent('teams unavailable')
  })

  it('reload() re-runs both queries', async () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'u1' } } })
    mockFrom()
    const user = userEvent.setup()

    render(
      <MembershipProvider>
        <Harness />
      </MembershipProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    supabase.from.mockClear()

    await user.click(screen.getByRole('button', { name: 'Reload' }))

    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('memberships'))
    expect(supabase.from).toHaveBeenCalledWith('teams')
  })

  it('does not update state after unmount', async () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'u1' } } })
    let resolveSelect
    supabase.from.mockImplementation(() => ({
      select: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveSelect = resolve
          }),
      ),
    }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = render(
      <MembershipProvider>
        <Harness />
      </MembershipProvider>,
    )

    unmount()
    resolveSelect?.({ data: [MEMBERSHIP_ROW], error: null })
    await Promise.resolve()
    await Promise.resolve()

    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining('a test was not wrapped in act'),
    )
    consoleError.mockRestore()
  })

  it('throws a clear error when useMemberships is used outside MembershipProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    function BareHarness() {
      useMemberships()
      return null
    }

    expect(() => render(<BareHarness />)).toThrow(
      /useMemberships must be used within a MembershipProvider/,
    )

    consoleError.mockRestore()
  })
})

describe('MembershipProvider view-as preview', () => {
  const VIEW_AS_KEY = 'quins.viewAs'

  function renderAs({ session = { user: { id: 'u1' } }, memberships, teams } = {}) {
    useAuthMock.mockReturnValue({ session })
    mockFrom({ memberships, teams })
    return render(
      <MembershipProvider>
        <ViewAsHarness />
      </MembershipProvider>,
    )
  }

  it('returns the real membership set when nothing is being previewed', async () => {
    renderAs({ memberships: [ADMIN_ROW] })
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    expect(screen.getByTestId('viewAs')).toHaveTextContent('null')
    expect(screen.getByTestId('memberships')).toHaveTextContent('m-admin')
    expect(screen.getByTestId('real')).toHaveTextContent('m-admin')
  })

  it('gives an admin the synthetic set while previewing, and keeps realMemberships true', async () => {
    const user = userEvent.setup()
    renderAs({ memberships: [ADMIN_ROW] })
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    const effective = JSON.parse(screen.getByTestId('memberships').textContent)
    expect(effective).toEqual([
      {
        id: 'view-as',
        role: 'parent',
        team_id: 'team-1',
        player_id: null,
        club_id: 'club-ad',
      },
    ])
    expect(screen.getByTestId('real')).toHaveTextContent('m-admin')
    expect(JSON.parse(window.localStorage.getItem(VIEW_AS_KEY))).toEqual({
      role: 'parent',
      teamId: 'team-1',
    })
  })

  it('exits the preview back to the real set', async () => {
    const user = userEvent.setup()
    renderAs({ memberships: [ADMIN_ROW] })
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    await user.click(screen.getByRole('button', { name: 'Exit' }))

    expect(screen.getByTestId('viewAs')).toHaveTextContent('null')
    expect(screen.getByTestId('memberships')).toHaveTextContent('m-admin')
    expect(window.localStorage.getItem(VIEW_AS_KEY)).toBeNull()
  })

  it('refuses to preview for a non-admin, even if one is stored', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(VIEW_AS_KEY, JSON.stringify({ role: 'parent', teamId: 'team-1' }))

    renderAs({ memberships: [MEMBERSHIP_ROW] })
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    expect(screen.getByTestId('viewAs')).toHaveTextContent('null')
    expect(screen.getByTestId('memberships')).toHaveTextContent('m-1')
    await waitFor(() => expect(window.localStorage.getItem(VIEW_AS_KEY)).toBeNull())

    // And a coach who calls the setter directly still gets the real set.
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByTestId('memberships')).toHaveTextContent('m-1')
    await waitFor(() => expect(screen.getByTestId('viewAs')).toHaveTextContent('null'))
  })

  it('restores a valid stored preview for an admin on load', async () => {
    window.localStorage.setItem(VIEW_AS_KEY, JSON.stringify({ role: 'coach', teamId: 'team-1' }))

    renderAs({ memberships: [ADMIN_ROW] })
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await waitFor(() => expect(screen.getByTestId('memberships')).toHaveTextContent('view-as'))
    expect(screen.getByTestId('viewAs')).toHaveTextContent('team-1')
    expect(window.localStorage.getItem(VIEW_AS_KEY)).not.toBeNull()
  })

  it('drops a stored preview whose team no longer exists', async () => {
    window.localStorage.setItem(VIEW_AS_KEY, JSON.stringify({ role: 'coach', teamId: 'team-gone' }))

    renderAs({ memberships: [ADMIN_ROW] })
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    expect(screen.getByTestId('viewAs')).toHaveTextContent('null')
    expect(screen.getByTestId('memberships')).toHaveTextContent('m-admin')
    await waitFor(() => expect(window.localStorage.getItem(VIEW_AS_KEY)).toBeNull())
  })

  it('clears the preview on sign-out', async () => {
    const user = userEvent.setup()
    useAuthMock.mockReturnValue({ session: { user: { id: 'u1' } } })
    mockFrom({ memberships: [ADMIN_ROW] })

    const { rerender } = render(
      <MembershipProvider>
        <ViewAsHarness />
      </MembershipProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByTestId('memberships')).toHaveTextContent('view-as')

    useAuthMock.mockReturnValue({ session: null })
    rerender(
      <MembershipProvider>
        <ViewAsHarness />
      </MembershipProvider>,
    )

    expect(screen.getByTestId('viewAs')).toHaveTextContent('null')
    expect(screen.getByTestId('memberships')).toHaveTextContent('[]')
    expect(window.localStorage.getItem(VIEW_AS_KEY)).toBeNull()
  })

  it('survives a localStorage that throws', async () => {
    const getItem = vi
      .spyOn(window.localStorage.__proto__, 'getItem')
      .mockImplementation(() => {
        throw new Error('access denied')
      })
    const setItem = vi
      .spyOn(window.localStorage.__proto__, 'setItem')
      .mockImplementation(() => {
        throw new Error('access denied')
      })
    const user = userEvent.setup()

    renderAs({ memberships: [ADMIN_ROW] })
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByTestId('memberships')).toHaveTextContent('view-as')

    getItem.mockRestore()
    setItem.mockRestore()
  })
})
