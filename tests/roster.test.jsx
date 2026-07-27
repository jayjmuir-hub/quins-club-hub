import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/Roster.jsx + src/screens/PlayerDetail.jsx
// (Task 12). useMemberships and src/data/players.js are mocked, so this
// exercises only the screens' own behaviour — scoping the query to the
// user's visible teams, the age-group vs position grouping rule, the search
// filter, the player detail sheet, and the loading/empty/error contract. No
// network is ever reachable from this file.
//
// The contact assertions are the safeguarding ones and matter most: a
// parent's getPlayerContact() legitimately resolves null (RLS hides the row),
// which must render *nothing at all* — not an error, and not a "contact
// details are hidden" message that would leak the existence of data this
// user may not see.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const getPlayerContactMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  getPlayerContact: (...args) => getPlayerContactMock(...args),
}))

// Import after vi.mock so this binds to the mocked modules.
import Roster from '../src/screens/Roster.jsx'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_FIRST_XV = { id: 'team-1xv', name: 'Senior Men 1st XV', sort_order: 13 }
const TEAMS = [TEAM_FIRST_XV, TEAM_U10] // deliberately unsorted; visibleTeams sorts

const ADMIN = [{ id: 'm1', role: 'admin', team_id: null }]
const COACH_ONE_TEAM = [{ id: 'm2', role: 'coach', team_id: 'team-u10' }]
const PARENT = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p-flanker' }]
// A membership pointing at a team that isn't in the teams list — visibleTeams
// resolves it to zero teams. See the "no visible teams" test for why that
// case is asserted rather than assumed away.
const UNRESOLVED_TEAM = [{ id: 'm4', role: 'parent', team_id: 'team-gone', player_id: 'p-x' }]

// Positions chosen to hit all three position groups: Flanker + Prop =>
// Forwards, Fly-half => Backs, Utility => Other. Jersey numbers are out of
// order in this array so the "sorted by jersey" assertions mean something,
// and NUMBERLESS has jersey_num null so it can prove numberless-goes-last.
const FLANKER = {
  id: 'p-flanker',
  team_id: 'team-u10',
  full_name: 'Tom Fletcher',
  jersey_num: 7,
  position: 'Flanker',
  is_captain: true,
}
const FLY_HALF = {
  id: 'p-fly-half',
  team_id: 'team-u10',
  full_name: 'Ali Hassan',
  jersey_num: 10,
  position: 'Fly-half',
  is_captain: false,
}
const PROP = {
  id: 'p-prop',
  team_id: 'team-u10',
  full_name: 'Ben Okafor',
  jersey_num: 1,
  position: 'Prop',
  is_captain: false,
}
const NUMBERLESS = {
  id: 'p-utility',
  team_id: 'team-u10',
  full_name: 'Sami Rahman',
  jersey_num: null,
  position: 'Utility',
  is_captain: false,
}
// Two more numberless players, both Forwards, so "numberless sorts last"
// is asserted *within* a group that also holds numbered players — with a
// numberless player alone in its own group the assertion proves nothing.
// Their names are reversed relative to fixture order so the tie-break
// between two numberless players is exercised too.
const NUMBERLESS_HOOKER = {
  id: 'p-hooker',
  team_id: 'team-u10',
  full_name: 'Zaid Noor',
  jersey_num: null,
  position: 'Hooker',
  is_captain: false,
}
const NUMBERLESS_LOCK = {
  id: 'p-lock',
  team_id: 'team-u10',
  full_name: 'Adam Price',
  jersey_num: null,
  position: 'Lock',
  is_captain: false,
}
const SENIOR = {
  id: 'p-fullback',
  team_id: 'team-1xv',
  full_name: 'Craig Muir',
  jersey_num: 15,
  position: 'Fullback',
  is_captain: false,
}

const ALL_PLAYERS = [FLY_HALF, PROP, SENIOR, FLANKER, NUMBERLESS, NUMBERLESS_HOOKER, NUMBERLESS_LOCK]
const U10_PLAYERS = [FLY_HALF, PROP, FLANKER, NUMBERLESS, NUMBERLESS_HOOKER, NUMBERLESS_LOCK]

// jsdom applies no CSS at all — no Tailwind, and no UA stylesheet layout
// either — so asserting on the literal class token is the only way to make a
// statement about how something will actually be laid out. Same helper, same
// reasoning as tests/schedule.test.jsx and tests/components.test.jsx.
function hasClassToken(element, token) {
  return element.className.split(/\s+/).includes(token)
}

function memberships(rows, teams = TEAMS) {
  return { memberships: rows, teams, loading: false, error: null, reload: vi.fn() }
}

const groupLabels = () => screen.getAllByTestId('group-label').map((node) => node.textContent)
const playerNames = () => screen.getAllByTestId('player-name').map((node) => node.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue(memberships(ADMIN))
  listPlayersMock.mockResolvedValue(ALL_PLAYERS)
  getPlayerContactMock.mockResolvedValue(null)
})

function setup() {
  const user = userEvent.setup()
  const utils = render(<Roster />)
  return { user, ...utils }
}

describe('Roster — loading, empty and error states', () => {
  it('shows a loading state while the players query is in flight', () => {
    listPlayersMock.mockReturnValue(new Promise(() => {}))

    setup()

    expect(screen.getByRole('status')).toHaveAccessibleName(/loading/i)
  })

  it('shows an empty state when the club has no players in view', async () => {
    listPlayersMock.mockResolvedValue([])

    setup()

    expect(await screen.findByText(/no players yet/i)).toBeInTheDocument()
  })

  it('renders a failed players query in an alert region, with a retry', async () => {
    listPlayersMock.mockRejectedValue(new Error('Network unreachable'))

    const { user } = setup()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/network unreachable/i)).toBeInTheDocument()

    listPlayersMock.mockResolvedValue(ALL_PLAYERS)
    await user.click(within(alert).getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Tom Fletcher')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Roster — scoping the query', () => {
  it('queries only the team a coach can see', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))

    setup()

    await screen.findByText('Tom Fletcher')
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: ['team-u10'] })
  })

  it('passes every visible team, in display order, for an admin', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: ['team-u10', 'team-1xv'] })
  })

  // The deliberate zero-teams decision: an empty teamIds array means "no
  // teams, show nothing" (src/data/players.js), never "no filter, show
  // everything". Asking for [] and rendering the empty state is the only
  // safe reading — the alternative would show a user with no resolvable
  // squad every player in the club.
  it('asks for no teams, and shows nothing, when no team resolves', async () => {
    useMembershipsMock.mockReturnValue(memberships(UNRESOLVED_TEAM))
    listPlayersMock.mockResolvedValue([])

    setup()

    expect(await screen.findByText(/no players yet/i)).toBeInTheDocument()
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: [] })
  })
})

describe('Roster — grouping', () => {
  it('groups by age group, in team display order, when several teams are visible', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    expect(groupLabels()).toEqual(['U10', 'Senior Men 1st XV'])
  })

  it('omits an age group with no players in it', async () => {
    listPlayersMock.mockResolvedValue([SENIOR])

    setup()

    await screen.findByText('Craig Muir')
    expect(groupLabels()).toEqual(['Senior Men 1st XV'])
  })

  it('groups by position when the user can only see one team', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))
    listPlayersMock.mockResolvedValue(U10_PLAYERS)

    setup()

    await screen.findByText('Tom Fletcher')
    expect(groupLabels()).toEqual(['Forwards', 'Backs', 'Other'])
  })

  it('switches to position grouping when an admin picks a single team', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    expect(groupLabels()).toEqual(['U10', 'Senior Men 1st XV'])

    await user.click(screen.getByRole('button', { name: /^U10/ }))

    expect(groupLabels()).toEqual(['Forwards', 'Backs', 'Other'])
    expect(screen.queryByText('Craig Muir')).not.toBeInTheDocument()
  })

  it('sorts a position group by jersey number, numberless last', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))
    listPlayersMock.mockResolvedValue(U10_PLAYERS)

    setup()

    await screen.findByText('Tom Fletcher')
    // Forwards: Ben (1), Tom (7), then the two numberless ones by name;
    // Backs: Ali (10); Other: Sami (none).
    expect(playerNames()).toEqual([
      'Ben Okafor',
      'Tom Fletcher',
      'Adam Price',
      'Zaid Noor',
      'Ali Hassan',
      'Sami Rahman',
    ])
  })

  it('shows each group’s player count', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))
    listPlayersMock.mockResolvedValue(U10_PLAYERS)

    setup()

    await screen.findByText('Tom Fletcher')
    const counts = screen.getAllByTestId('group-count').map((node) => node.textContent)
    expect(counts).toEqual(['4', '1', '1'])
  })

  it('hides the team filter when the user can only see one team', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))

    setup()

    await screen.findByText('Tom Fletcher')
    expect(screen.queryByRole('button', { name: /^All/ })).not.toBeInTheDocument()
  })
})

describe('Roster — search', () => {
  it('filters by name, case-insensitively', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    await user.type(screen.getByRole('searchbox'), 'fletch')

    expect(playerNames()).toEqual(['Tom Fletcher'])
  })

  it('filters by position', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    await user.type(screen.getByRole('searchbox'), 'fullback')

    expect(playerNames()).toEqual(['Craig Muir'])
  })

  it('filters by age group name', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    await user.type(screen.getByRole('searchbox'), 'senior men')

    expect(playerNames()).toEqual(['Craig Muir'])
  })

  it('filters by jersey number', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    await user.type(screen.getByRole('searchbox'), '15')

    expect(playerNames()).toEqual(['Craig Muir'])
  })

  it('drops a group entirely when nothing in it matches', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    await user.type(screen.getByRole('searchbox'), 'craig')

    expect(groupLabels()).toEqual(['Senior Men 1st XV'])
  })

  it('shows a no-matches message rather than the empty roster message', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    await user.type(screen.getByRole('searchbox'), 'zzz')

    expect(screen.getByText(/no players match/i)).toBeInTheDocument()
    expect(screen.queryByText(/no players yet/i)).not.toBeInTheDocument()
  })
})

describe('Roster — player rows', () => {
  it('shows the jersey number, position and age group on each row', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    const row = screen.getByRole('button', { name: /Tom Fletcher/ })
    expect(within(row).getByText('7')).toBeInTheDocument()
    expect(within(row).getByText('Flanker · U10')).toBeInTheDocument()
  })

  it('marks the captain', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    const row = screen.getByRole('button', { name: /Tom Fletcher/ })
    expect(within(row).getByText('Capt')).toBeInTheDocument()
  })

  // A <button> used as a layout box inherits Chromium's UA content-centring,
  // which jsdom neither applies nor computes. The testable invariant is that
  // the row sets its own layout explicitly instead of relying on defaults.
  it('lays the row out explicitly rather than relying on button defaults', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    const rows = screen.getAllByTestId('player-row')
    expect(rows.length).toBeGreaterThan(0)
    ;['flex', 'w-full', 'items-center', 'text-left'].forEach((token) => {
      expect(rows.every((row) => hasClassToken(row, token))).toBe(true)
    })
  })
})

describe('Roster — scope note', () => {
  it('tells a coach which squads they are seeing', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))

    setup()

    await screen.findByText('Tom Fletcher')
    expect(screen.getByText(/you're seeing u10/i)).toBeInTheDocument()
  })

  it('tells a parent their view is read-only', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    setup()

    await screen.findByText('Tom Fletcher')
    expect(screen.getByText(/read-only/i)).toBeInTheDocument()
  })

  it('shows no scope note to an admin', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    expect(screen.queryByText(/you're seeing/i)).not.toBeInTheDocument()
  })
})

describe('PlayerDetail — opening a player', () => {
  async function openTom(user) {
    await screen.findByText('Tom Fletcher')
    await user.click(screen.getByRole('button', { name: /Tom Fletcher/ }))
    return screen.getByRole('dialog')
  }

  it('opens a dialog with the player’s details', async () => {
    const { user } = setup()

    const dialog = await openTom(user)

    expect(within(dialog).getByRole('heading', { name: 'Tom Fletcher' })).toBeInTheDocument()
    expect(within(dialog).getByText('Flanker')).toBeInTheDocument()
    expect(within(dialog).getByText('U10')).toBeInTheDocument()
    expect(within(dialog).getByText('Captain')).toBeInTheDocument()
    expect(getPlayerContactMock).toHaveBeenCalledWith('p-flanker')
  })

  it('closes on the close button', async () => {
    const { user } = setup()

    const dialog = await openTom(user)
    await user.click(within(dialog).getByRole('button', { name: /close/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('PlayerDetail — contact details', () => {
  async function openTom(user) {
    await screen.findByText('Tom Fletcher')
    await user.click(screen.getByRole('button', { name: /Tom Fletcher/ }))
    return screen.getByRole('dialog')
  }

  it('shows phone and email as links when the contact row comes back', async () => {
    getPlayerContactMock.mockResolvedValue({
      player_id: 'p-flanker',
      phone: '+971 50 200 1000',
      email: 'tom.fletcher@example.com',
    })

    const { user } = setup()
    await openTom(user)

    expect(await screen.findByRole('link', { name: '+971 50 200 1000' })).toHaveAttribute(
      'href',
      'tel:+971502001000',
    )
    expect(screen.getByRole('link', { name: 'tom.fletcher@example.com' })).toHaveAttribute(
      'href',
      'mailto:tom.fletcher@example.com',
    )
  })

  // The safeguarding case. RLS returns no row for a parent, which is normal,
  // not an error — and the UI must not hint that a hidden row exists.
  it('renders no contact block, and no explanation, when RLS returns no row', async () => {
    getPlayerContactMock.mockResolvedValue(null)

    const { user } = setup()
    const dialog = await openTom(user)

    expect(await within(dialog).findByText('Captain')).toBeInTheDocument()
    expect(within(dialog).queryByText(/contact/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/hidden/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/phone/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/email/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows only the fields the contact row actually has', async () => {
    getPlayerContactMock.mockResolvedValue({ player_id: 'p-flanker', phone: null, email: 'a@example.com' })

    const { user } = setup()
    const dialog = await openTom(user)

    expect(await within(dialog).findByRole('link', { name: 'a@example.com' })).toBeInTheDocument()
    expect(within(dialog).queryByText('Phone')).not.toBeInTheDocument()
  })

  it('reports a failed contact query in an alert', async () => {
    getPlayerContactMock.mockRejectedValue(new Error('Contact lookup failed'))

    const { user } = setup()
    const dialog = await openTom(user)

    const alert = await within(dialog).findByRole('alert')
    expect(within(alert).getByText(/contact lookup failed/i)).toBeInTheDocument()
  })
})
