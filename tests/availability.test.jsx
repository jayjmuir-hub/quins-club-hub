import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/Availability.jsx (Task 16): the RSVP /
// team-sheet sheet opened from EventDetail. useMemberships and every data
// module are mocked, so no network is reachable from this file.
//
// The theme running through this file is scope: a coach/admin can override
// ANY player's status, a parent/player may only toggle their OWN child(ren)
// (childPlayerIds), and everyone else sees a static, unclickable status —
// never a control the database is guaranteed to refuse.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const listAvailabilityMock = vi.fn()
const subscribeAvailabilityMock = vi.fn()
const setAvailabilityMock = vi.fn()
const clearAvailabilityMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))

vi.mock('../src/data/availability.js', () => ({
  listAvailability: (...args) => listAvailabilityMock(...args),
  subscribeAvailability: (...args) => subscribeAvailabilityMock(...args),
  setAvailability: (...args) => setAvailabilityMock(...args),
  clearAvailability: (...args) => clearAvailabilityMock(...args),
}))

const setAvailabilityOverrideMock = vi.fn()
vi.mock('../src/data/events.js', () => ({
  setAvailabilityOverride: (...args) => setAvailabilityOverrideMock(...args),
}))

// Imported after vi.mock so this binds to the mocked modules.
import Availability from '../src/screens/Availability.jsx'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }

const EVENT = {
  id: 'e-1',
  team_id: 'team-u10',
  type: 'match',
  opponent: 'Dubai Exiles',
  home: true,
  starts_at: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
  result_us: null,
  result_them: null,
}

// One day before a match: 5 days inside the lock window.
const LOCKED_MATCH = { ...EVENT, starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }

const OVERRIDE_LOCKED = { ...EVENT, availability_override: 'locked' }
const OVERRIDE_OPEN_INWINDOW = {
  ...EVENT,
  availability_override: 'open',
  starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 1 day out: auto would lock a match
}

const PLAYER_TOM = { id: 'p-tom', team_id: 'team-u10', full_name: 'Tom Fletcher' }
const PLAYER_ANA = { id: 'p-ana', team_id: 'team-u10', full_name: 'Ana Silva' }
const PLAYER_JOE = { id: 'p-joe', team_id: 'team-u10', full_name: 'Joe Brown' }
const ROSTER = [PLAYER_ANA, PLAYER_JOE, PLAYER_TOM]

const ADMIN = [{ id: 'm1', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null }]
const COACH = [{ id: 'm2', role: 'coach', status: 'active', team_id: 'team-u10' }]
const PARENT_OF_TOM = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p-tom' }]

function memberships(rows) {
  return { memberships: rows, teams: [TEAM_U10], loading: false, error: null, reload: vi.fn() }
}

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue(memberships(ADMIN))
  listPlayersMock.mockResolvedValue(ROSTER)
  listAvailabilityMock.mockResolvedValue([])
  subscribeAvailabilityMock.mockReturnValue(vi.fn())
  setAvailabilityMock.mockResolvedValue({ id: 'a-1' })
  clearAvailabilityMock.mockResolvedValue([{ id: 'a-1' }])
  setAvailabilityOverrideMock.mockResolvedValue({ id: 'e-1', availability_override: 'open' })
})

function setup(props = {}) {
  const user = userEvent.setup()
  const utils = render(
    <Availability event={EVENT} team={TEAM_U10} onClose={vi.fn()} {...props} />,
  )
  return { user, ...utils }
}

describe('Availability — the row being saved says so', () => {
  it('shows Saving… on the tapped row while the write is in flight, and nowhere else', async () => {
    listPlayersMock.mockResolvedValue([PLAYER_TOM, PLAYER_ANA])
    listAvailabilityMock.mockResolvedValue([])
    setAvailabilityMock.mockReturnValue(new Promise(() => {}))
    const { user } = setup()
    const rows = await screen.findAllByRole('listitem')
    await user.click(within(rows[0]).getByRole('button', { name: /^in$/i }))
    // 2 Sep 2026 UX review, extra findings: a greyed button alone did not read as saving.
    expect(within(rows[0]).getByTestId('row-saving')).toHaveTextContent('Saving…')
    expect(within(rows[1]).queryByTestId('row-saving')).toBeNull()
  })
})

describe('Availability — loading/empty/error', () => {
  it('shows a spinner on first load', () => {
    listPlayersMock.mockReturnValue(new Promise(() => {}))
    setup()

    expect(screen.getByRole('status')).toHaveAccessibleName(/loading/i)
  })

  it('shows a message when the squad has no players', async () => {
    listPlayersMock.mockResolvedValue([])
    setup()

    expect(await screen.findByText(/no players/i)).toBeInTheDocument()
  })

  it('surfaces a player-load failure as a visible alert, not a crash', async () => {
    listPlayersMock.mockRejectedValue(new Error('Players unavailable'))
    setup()

    expect(await screen.findByRole('alert')).toHaveTextContent(/players unavailable/i)
  })

  it('surfaces an availability-load failure as a visible alert', async () => {
    listAvailabilityMock.mockRejectedValue(new Error('Availability unavailable'))
    setup()

    expect(await screen.findByRole('alert')).toHaveTextContent(/availability unavailable/i)
  })

  // ⚠️ THE TWO CASES friendlyMessage EXISTS FOR (2 Sep 2026 UX review, item
  // 2). Before the sweep this screen rendered `error.message || fallback`,
  // so a PostgREST failure put its own jargon in the club's red box; the
  // `||` only fired on an EMPTY message. The first case below was run red
  // against that code. The second guards the other direction: a refusal the
  // database wrote FOR the person must not be flattened into the fallback.
  it('⚠️ hides a coded database failure behind the screen\'s own sentence', async () => {
    listAvailabilityMock.mockRejectedValue(
      Object.assign(new Error('JSON object requested, multiple (or no) rows returned'), {
        code: 'PGRST116',
      }),
    )
    setup()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn.t load availability/i)
    expect(alert).not.toHaveTextContent(/JSON object/i)
  })

  it('still shows a refusal the database wrote for the person, word for word', async () => {
    listAvailabilityMock.mockRejectedValue(
      Object.assign(new Error('You are not allowed to see this squad.'), { code: '42501' }),
    )
    setup()

    expect(await screen.findByRole('alert')).toHaveTextContent(/not allowed to see this squad/i)
  })
})

describe('Availability — team sheet tallies', () => {
  it('tallies in/maybe/out/no-response counts, deriving no-response from the roster diff', async () => {
    listAvailabilityMock.mockResolvedValue([
      { id: 'a1', event_id: 'e-1', player_id: 'p-ana', status: 'in' },
      { id: 'a2', event_id: 'e-1', player_id: 'p-joe', status: 'maybe' },
    ])
    setup()

    expect(await screen.findByText(/1 in/i)).toBeInTheDocument()
    expect(screen.getByText(/1 maybe/i)).toBeInTheDocument()
    expect(screen.getByText(/0 out/i)).toBeInTheDocument()
    // p-tom has no row at all — that is what makes them "no response", not
    // a status value stored anywhere.
    expect(screen.getByText(/1 no response/i)).toBeInTheDocument()
  })

  it('lists every player on the roster, including those with no response row', async () => {
    listAvailabilityMock.mockResolvedValue([
      { id: 'a1', event_id: 'e-1', player_id: 'p-ana', status: 'in' },
    ])
    setup()

    expect(await screen.findByText('Ana Silva')).toBeInTheDocument()
    expect(screen.getByText('Joe Brown')).toBeInTheDocument()
    expect(screen.getByText('Tom Fletcher')).toBeInTheDocument()
  })
})

describe('Availability — coach/admin can override anyone', () => {
  it('shows an override control for every player and calls setAvailability with the event/player/status', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    const { user } = setup()

    await screen.findByText('Ana Silva')
    const row = screen.getByText('Ana Silva').closest('li')
    await user.click(within(row).getByRole('button', { name: /^in$/i }))

    expect(setAvailabilityMock).toHaveBeenCalledWith('e-1', 'p-ana', 'in')
  })

  it('updates the clicked row to the new status as soon as the save succeeds, without waiting for realtime', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    listAvailabilityMock.mockResolvedValue([
      { id: 'a1', event_id: 'e-1', player_id: 'p-ana', status: 'in' },
    ])
    setAvailabilityMock.mockResolvedValue({
      id: 'a1',
      event_id: 'e-1',
      player_id: 'p-ana',
      status: 'maybe',
    })
    const { user } = setup()

    await screen.findByText('Ana Silva')
    const row = screen.getByText('Ana Silva').closest('li')

    expect(within(row).getByRole('button', { name: /^in$/i })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(row).getByRole('button', { name: /maybe/i }))

    expect(within(row).getByRole('button', { name: /maybe/i })).toHaveAttribute('aria-pressed', 'true')
    expect(within(row).getByRole('button', { name: /^in$/i })).toHaveAttribute('aria-pressed', 'false')
    expect(await screen.findByText(/1 maybe/i)).toBeInTheDocument()
    expect(screen.getByText(/0 in/i)).toBeInTheDocument()
  })

  it('does not change the row status when the save is refused', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    listAvailabilityMock.mockResolvedValue([
      { id: 'a1', event_id: 'e-1', player_id: 'p-ana', status: 'in' },
    ])
    setAvailabilityMock.mockRejectedValue(new Error("We couldn't save that RSVP."))
    const { user } = setup()

    await screen.findByText('Ana Silva')
    const row = screen.getByText('Ana Silva').closest('li')

    await user.click(within(row).getByRole('button', { name: /maybe/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /^in$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(within(row).getByRole('button', { name: /maybe/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('lets an admin override too', async () => {
    useMembershipsMock.mockReturnValue(memberships(ADMIN))
    const { user } = setup()

    await screen.findByText('Joe Brown')
    const row = screen.getByText('Joe Brown').closest('li')
    await user.click(within(row).getByRole('button', { name: /out/i }))

    expect(setAvailabilityMock).toHaveBeenCalledWith('e-1', 'p-joe', 'out')
  })
})

describe('Availability — parent/player scoping', () => {
  it('shows a toggle only for the own child, and a static label for everyone else', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_TOM))
    setup()

    await screen.findByText('Tom Fletcher')

    const tomRow = screen.getByText('Tom Fletcher').closest('li')
    expect(within(tomRow).getByRole('button', { name: /^in$/i })).toBeInTheDocument()

    const anaRow = screen.getByText('Ana Silva').closest('li')
    expect(within(anaRow).queryByRole('button', { name: /^in$/i })).not.toBeInTheDocument()
  })

  it('sets availability only for the parent’s own child, never for another player', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_TOM))
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    const tomRow = screen.getByText('Tom Fletcher').closest('li')
    await user.click(within(tomRow).getByRole('button', { name: /maybe/i }))

    expect(setAvailabilityMock).toHaveBeenCalledWith('e-1', 'p-tom', 'maybe')
    expect(setAvailabilityMock).not.toHaveBeenCalledWith('e-1', 'p-ana', expect.anything())
  })
})

describe('Availability — save failures', () => {
  it('surfaces an RLS-style refusal as a visible alert rather than crashing', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_TOM))
    setAvailabilityMock.mockRejectedValue(new Error("We couldn't save that RSVP."))
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    const tomRow = screen.getByText('Tom Fletcher').closest('li')
    await user.click(within(tomRow).getByRole('button', { name: /out/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save that rsvp/i)
  })
})

describe('Availability — realtime', () => {
  it('subscribes to the event and refetches on a change, without flashing a spinner', async () => {
    listAvailabilityMock.mockResolvedValue([
      { id: 'a1', event_id: 'e-1', player_id: 'p-ana', status: 'in' },
    ])
    setup()

    expect(await screen.findByText(/1 in/i)).toBeInTheDocument()
    expect(subscribeAvailabilityMock).toHaveBeenCalledWith('e-1', expect.any(Function))

    let resolveRefresh
    listAvailabilityMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve
      }),
    )

    const [, onChange] = subscribeAvailabilityMock.mock.calls[0]
    act(() => {
      onChange({ eventType: 'INSERT' })
    })

    // Still showing the previous tally, no spinner torn in over it.
    expect(screen.getByText(/1 in/i)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await act(async () => {
      resolveRefresh([
        { id: 'a1', event_id: 'e-1', player_id: 'p-ana', status: 'in' },
        { id: 'a2', event_id: 'e-1', player_id: 'p-joe', status: 'in' },
      ])
    })

    expect(await screen.findByText(/2 in/i)).toBeInTheDocument()
  })

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn()
    subscribeAvailabilityMock.mockReturnValue(unsubscribe)
    const { unmount } = setup()

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe('Availability — clear and lock', () => {
  it('⚠️ tapping the answer already given does NOTHING — clearing is its own control', async () => {
    // 2 Sep 2026 UX review (parents, Medium): a nervous double-tap on "In"
    // used to become "No response" with no sign.
    useMembershipsMock.mockReturnValue(memberships(COACH))
    listAvailabilityMock.mockResolvedValue([
      { id: 'a1', event_id: 'e-1', player_id: 'p-ana', status: 'in' },
    ])
    const { user } = setup()
    await screen.findByText('Ana Silva')
    const row = screen.getByText('Ana Silva').closest('li')
    await user.click(within(row).getByRole('button', { name: /^in$/i }))
    expect(clearAvailabilityMock).not.toHaveBeenCalled()
    expect(setAvailabilityMock).not.toHaveBeenCalled()
    expect(within(row).getByRole('button', { name: /^in$/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clears a status through the explicit Clear control', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    listAvailabilityMock.mockResolvedValue([
      { id: 'a1', event_id: 'e-1', player_id: 'p-ana', status: 'in' },
    ])
    clearAvailabilityMock.mockResolvedValue([{ id: 'a1' }])
    const { user } = setup()

    await screen.findByText('Ana Silva')
    const row = screen.getByText('Ana Silva').closest('li')
    expect(within(row).getByRole('button', { name: /^in$/i })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(row).getByRole('button', { name: /clear answer/i }))

    expect(clearAvailabilityMock).toHaveBeenCalledWith('e-1', 'p-ana')
    expect(within(row).getByRole('button', { name: /^in$/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('refetches instead of optimistically clearing when the delete removed nothing', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    listAvailabilityMock.mockResolvedValue([
      { id: 'a1', event_id: 'e-1', player_id: 'p-ana', status: 'in' },
    ])
    clearAvailabilityMock.mockResolvedValue([])
    const { user } = setup()

    await screen.findByText('Ana Silva')
    const row = screen.getByText('Ana Silva').closest('li')
    const before = listAvailabilityMock.mock.calls.length

    await user.click(within(row).getByRole('button', { name: /clear answer/i }))

    await waitFor(() => expect(listAvailabilityMock.mock.calls.length).toBeGreaterThan(before))
  })

  it('locks a parent out inside the window: disabled buttons, a notice, no write', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_TOM))
    const { user } = setup({ event: LOCKED_MATCH })

    await screen.findByText('Tom Fletcher')
    const tomRow = screen.getByText('Tom Fletcher').closest('li')
    const inBtn = within(tomRow).getByRole('button', { name: /^in$/i })

    expect(inBtn).toBeDisabled()
    expect(screen.getByText(/availability is closed/i)).toBeInTheDocument()

    await user.click(inBtn)
    expect(setAvailabilityMock).not.toHaveBeenCalled()
    expect(clearAvailabilityMock).not.toHaveBeenCalled()
  })

  it('never locks a coach, even inside the window', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    const { user } = setup({ event: LOCKED_MATCH })

    await screen.findByText('Ana Silva')
    const row = screen.getByText('Ana Silva').closest('li')
    const inBtn = within(row).getByRole('button', { name: /^in$/i })

    expect(inBtn).not.toBeDisabled()
    await user.click(inBtn)
    expect(setAvailabilityMock).toHaveBeenCalledWith('e-1', 'p-ana', 'in')
  })
})

describe('Availability — per-event override', () => {
  it('shows the staff override control and writes on change', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    const { user } = setup()

    await screen.findByText('Ana Silva')
    const group = screen.getByRole('group', { name: /self-service availability/i })
    await user.click(within(group).getByRole('button', { name: /^open$/i }))

    expect(setAvailabilityOverrideMock).toHaveBeenCalledWith('e-1', 'open')
  })

  it('does not show the override control to a parent', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_TOM))
    setup()
    await screen.findByText('Tom Fletcher')
    expect(screen.queryByRole('group', { name: /self-service availability/i })).not.toBeInTheDocument()
  })

  it('a parent on a manually-locked event sees disabled buttons and the manual notice', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_TOM))
    const { user } = setup({ event: OVERRIDE_LOCKED })
    await screen.findByText('Tom Fletcher')
    const tomRow = screen.getByText('Tom Fletcher').closest('li')
    expect(within(tomRow).getByRole('button', { name: /^in$/i })).toBeDisabled()
    expect(screen.getByText(/availability is closed for this event/i)).toBeInTheDocument()
    await user.click(within(tomRow).getByRole('button', { name: /^in$/i }))
    expect(setAvailabilityMock).not.toHaveBeenCalled()
  })

  it('a parent on an open override inside the auto window can still RSVP', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_TOM))
    const { user } = setup({ event: OVERRIDE_OPEN_INWINDOW })
    await screen.findByText('Tom Fletcher')
    const tomRow = screen.getByText('Tom Fletcher').closest('li')
    const inBtn = within(tomRow).getByRole('button', { name: /^in$/i })
    expect(inBtn).not.toBeDisabled()
    expect(screen.queryByText(/availability is closed/i)).not.toBeInTheDocument()
    await user.click(inBtn)
    expect(setAvailabilityMock).toHaveBeenCalledWith('e-1', 'p-tom', 'in')
  })
})
