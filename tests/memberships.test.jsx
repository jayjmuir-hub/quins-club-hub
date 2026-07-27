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

beforeEach(() => {
  useAuthMock.mockReset()
  supabase.from.mockReset()
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
