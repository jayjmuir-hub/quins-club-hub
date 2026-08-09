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
    // Added 6 Aug 2026 for roster auto-onboarding: the provider now calls the
    // claim_roster_access RPC for a user with no memberships.
    rpc: vi.fn(),
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
      // ⚠️ .select().eq() SINCE 9 Aug 2026, mirroring the real query.
      // loadMyMemberships used to select with no filter and trust RLS to scope
      // it — but `memb read` is (profile_id = auth.uid() OR is_admin(club_id)),
      // so for an ADMIN it returned the whole club as "my memberships". This
      // mock resolved on .select() and would keep passing either way, which is
      // why the bug reached production: the provider's own tests could not see
      // the difference between a scoped read and an unscoped one.
      const result = {
        data: membershipsError ? null : (memberships ?? [MEMBERSHIP_ROW]),
        error: membershipsError ?? null,
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue(result) }) }
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

// ---------------------------------------------------------------------------
// Roster auto-onboarding
// (claude/decisions/2026-08-06-roster-auto-onboarding.md).
//
// The provider calls claim_roster_access for a signed-in user holding NO
// memberships, and re-reads if anything was granted. The RPC itself is proved
// against the live database in a rolled-back transaction — see the migration.
// What is tested HERE is only the wiring, and the wiring has three ways to be
// wrong that matter:
//   - calling it for someone who already has access (a wasted round trip on
//     every load for every existing member, i.e. the common path)
//   - not re-reading afterwards (squads granted but the app still blank,
//     because `teams` was empty under RLS a moment ago)
//   - letting a failure become an error screen instead of RequestAccess
// ---------------------------------------------------------------------------
describe('MembershipProvider — roster auto-onboarding', () => {
  function mockClaim(rows) {
    supabase.rpc.mockResolvedValue({ data: rows, error: null })
  }

  // Local to this block: renderAs() lives inside the view-as describe and is
  // not in scope here.
  function renderProvider() {
    return render(
      <MembershipProvider>
        <Harness />
      </MembershipProvider>,
    )
  }

  beforeEach(() => {
    supabase.rpc.mockReset()
    useAuthMock.mockReturnValue({ session: { user: { id: 'u1' } } })
    mockClaim([])
  })

  it('does not call the RPC at all when the user already has access', async () => {
    mockFrom({ memberships: [MEMBERSHIP_ROW], teams: [TEAM_ROW] })
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('calls claim_roster_access for a user with no memberships', async () => {
    mockFrom({ memberships: [], teams: [] })
    renderProvider()

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('claim_roster_access'))
  })

  it('re-reads memberships AND teams after a successful claim', async () => {
    // First pass returns nothing (RLS shows a memberless user no squads); the
    // second must return both. Re-reading teams is the part most likely to be
    // forgotten, and forgetting it leaves the app rendering with no squads.
    let call = 0
    supabase.from.mockImplementation((table) => {
      // memberships goes through .select().eq(); teams through .select().
      if (table === 'memberships') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation(async () => ({
              data: call > 0 ? [MEMBERSHIP_ROW] : [],
              error: null,
            })),
          }),
        }
      }
      return {
        select: vi.fn().mockImplementation(async () => ({
          data: call > 0 ? [TEAM_ROW] : [],
          error: null,
        })),
      }
    })
    supabase.rpc.mockImplementation(async () => {
      call = 1
      return { data: [MEMBERSHIP_ROW], error: null }
    })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('memberships')).toHaveTextContent('m-1'))
    expect(screen.getByTestId('teams')).toHaveTextContent('U12')
  })

  it('leaves memberships empty when nothing matched, without erroring', async () => {
    mockFrom({ memberships: [], teams: [] })
    mockClaim([])
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('memberships')).toHaveTextContent('[]')
    // Empty memberships is what makes AppShell render RequestAccess. An error
    // here would replace that with a red retry screen and no way forward.
    expect(screen.getByTestId('error')).toHaveTextContent('none')
  })

  it('swallows a failed claim rather than turning it into an error screen', async () => {
    mockFrom({ memberships: [], teams: [] })
    supabase.rpc.mockRejectedValue(new Error('permission denied for function'))
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('error')).toHaveTextContent('none')
    expect(screen.getByTestId('memberships')).toHaveTextContent('[]')
  })

  it('tries once per user, not once per render', async () => {
    // The guard is a ref keyed on the user id. Without it, every reload — and
    // every StrictMode double-invoke — would fire another RPC.
    mockFrom({ memberships: [], teams: [] })
    const user = userEvent.setup()
    renderProvider()

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })
})
